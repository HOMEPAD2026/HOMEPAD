// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// The parts of Pons V2 the router touches (pons-labs, contractsV2/src/v2/interfaces/ILaunchpadV2.sol).
interface INftPonsEscrow {
    function claim() external returns (uint256 amount);
    function claimToken(address token) external returns (uint256 amount);
    function balanceOf(address recipient) external view returns (uint256);
    function balanceOfToken(address recipient, address token) external view returns (uint256);
}

interface INftPonsFactory {
    function setBuybackEnabled(address token, bool enabled) external;
}

interface INftWeth {
    function withdraw(uint256 amount) external;
    function balanceOf(address who) external view returns (uint256);
}

/// Arbitrum's system contract (0x64): the chain's own L2 block numbers and hashes. On Arbitrum chains `block.number`
/// is an L1 block number and `blockhash` isn't a real block hash, so the vault reads these instead.
interface IArbSys {
    function arbBlockNumber() external view returns (uint256);
    function arbBlockHash(uint256 blockNumber) external view returns (bytes32);
}

/// @title ARCIRCLE NFT Vault — buys NFTs with trading fees and raffles them to $ARCIRCLE holders
/// @notice Holds ETH from the fee router (or anyone). The ETH can leave in one way only: buying an NFT of a listed
///         collection through Seaport, at or under the collection's price cap, with the NFT arriving here in the same
///         transaction. There is no withdraw function. Each NFT is then raffled to $ARCIRCLE holders:
///           1. `open`   — the keeper posts the holder snapshot as a Merkle root of ticket ranges (each wallet's
///                         range is as wide as its weight) and the list's address; the draw can't happen before
///                         `CHALLENGE` has passed, so anyone can check the list first. Once a draw has been tried, the
///                         raffle can't be cancelled.
///           2. `commit` — the keeper commits to a secret (its hash);
///           3. `reveal` — the secret plus the hash of the next L2 block after the commit give the seed. The keeper
///                         can't pick the block hash, and nobody else knows the secret, so nobody can steer the result.
///                         A commit that isn't revealed in time expires and a new one is needed; every try is counted.
///           4. `settle` — anyone proves the wallet whose range holds `seed % total` and the NFT goes to it.
///         If no draw happens for `STUCK_AFTER` past the draw time, anyone may draw from the latest block hash.
///         Roles: the curator lists collections (each one takes `COLLECTION_DELAY` to become buyable; caps can be
///         lowered at once) and names the keeper; the keeper buys and runs raffles. Neither can move the ETH or the
///         NFTs any other way.
contract ArcircleNftVault is IERC721Receiver {
    uint256 public constant COLLECTION_DELAY = 24 hours;
    uint256 public constant CHALLENGE = 6 hours;
    uint256 public constant REVEAL_WINDOW = 200; // L2 blocks after the commit's next block (the chain keeps 256)
    uint256 public constant STUCK_AFTER = 7 days;

    address public immutable seaport;
    IArbSys public immutable arbSys; // address(0) off Arbitrum: block.number / blockhash
    address public curator;
    address public keeper;

    struct Collection { uint128 maxPrice; uint64 activeAt; bool listed; }
    mapping(address => Collection) public collections;
    address[] public collectionList;

    enum Status { None, Held, Open, Drawn, Won }
    struct Prize { address collection; uint256 tokenId; uint128 paid; uint64 at; Status status; bool donated; }
    Prize[] private _prizes;
    mapping(address => mapping(uint256 => uint256)) public prizeOf; // collection → tokenId → index + 1 while held

    struct Raffle {
        bytes32 root; uint128 total; uint64 snapshotBlock; uint64 drawAfter;
        bytes32 commitHash; uint64 commitBlock; uint32 attempts; uint64 openedAt;
        bytes32 seed; address winner; string list;
    }
    mapping(uint256 => Raffle) private _raffles;

    uint256 public totalIn;
    uint256 public totalSpent;
    bool private buying;
    uint256 private lock = 1;

    event Funded(address indexed from, uint256 amount);
    event CollectionProposed(address indexed collection, uint256 maxPrice, uint256 activeAt);
    event CollectionCapLowered(address indexed collection, uint256 maxPrice);
    event CollectionRemoved(address indexed collection);
    event KeeperSet(address indexed keeper);
    event CuratorSet(address indexed curator);
    event Bought(uint256 indexed prize, address indexed collection, uint256 indexed tokenId, uint256 paid);
    event Donated(uint256 indexed prize, address indexed collection, uint256 indexed tokenId, address from);
    event RaffleOpened(uint256 indexed prize, bytes32 root, uint256 total, uint256 snapshotBlock, uint256 drawAfter, string list);
    event RaffleCancelled(uint256 indexed prize);
    event Committed(uint256 indexed prize, bytes32 commitHash, uint256 commitBlock, uint256 attempt);
    event Drawn(uint256 indexed prize, bytes32 seed, uint256 ticket, bool forced);
    event Won(uint256 indexed prize, address indexed winner, address collection, uint256 tokenId);

    error NotCurator();
    error NotOps();
    error ZeroAddress();
    error Reentered();
    error NotAllowed();
    error TooExpensive();
    error NotEnough();
    error AlreadyHeld();
    error NotReceived();
    error BuyFailed(bytes reason);
    error BadPrize();
    error BadStatus();
    error BadRaffle();
    error TooEarly();
    error CommitLive();
    error NoCommit();
    error BadSecret();
    error RevealWindow();
    error NoHash();
    error NotTheTicket();
    error BadProof();
    error NotHeld();

    modifier once() { if (lock != 1) revert Reentered(); lock = 2; _; lock = 1; }
    modifier onlyCurator() { if (msg.sender != curator) revert NotCurator(); _; }
    modifier onlyOps() { if (msg.sender != keeper && msg.sender != curator) revert NotOps(); _; }

    constructor(address _seaport, address _arbSys, address _curator, address _keeper) {
        if (_seaport == address(0) || _curator == address(0) || _keeper == address(0)) revert ZeroAddress();
        seaport = _seaport;
        arbSys = IArbSys(_arbSys);
        curator = _curator;
        keeper = _keeper;
        emit CuratorSet(_curator);
        emit KeeperSet(_keeper);
    }

    receive() external payable {
        if (buying) return; // Seaport handing back change
        totalIn += msg.value;
        emit Funded(msg.sender, msg.value);
    }

    // ------------------------------------------------------------------ curator

    /// @notice Lists a collection (or raises its cap); it becomes buyable after COLLECTION_DELAY.
    function proposeCollection(address collection, uint128 maxPrice) external onlyCurator {
        if (collection == address(0)) revert ZeroAddress();
        Collection storage c = collections[collection];
        if (c.activeAt == 0) collectionList.push(collection);
        c.maxPrice = maxPrice;
        c.activeAt = uint64(block.timestamp + COLLECTION_DELAY);
        c.listed = true;
        emit CollectionProposed(collection, maxPrice, c.activeAt);
    }

    /// @notice Lowers a listed collection's cap at once (raising it goes through proposeCollection).
    function lowerCap(address collection, uint128 maxPrice) external onlyCurator {
        Collection storage c = collections[collection];
        if (!c.listed || maxPrice >= c.maxPrice) revert NotAllowed();
        c.maxPrice = maxPrice;
        emit CollectionCapLowered(collection, maxPrice);
    }

    function removeCollection(address collection) external onlyCurator {
        if (!collections[collection].listed) revert NotAllowed();
        collections[collection].listed = false;
        emit CollectionRemoved(collection);
    }

    function setKeeper(address next) external onlyCurator {
        if (next == address(0)) revert ZeroAddress();
        keeper = next;
        emit KeeperSet(next);
    }

    function setCurator(address next) external onlyCurator {
        if (next == address(0)) revert ZeroAddress();
        curator = next;
        emit CuratorSet(next);
    }

    // ------------------------------------------------------------------ buying

    /// @notice Buys `tokenId` of a listed collection through Seaport: `data` is the Seaport call, `price` the most it
    ///         may cost. Reverts unless the NFT is here afterwards and no more than `price` was spent.
    function buy(address collection, uint256 tokenId, uint256 price, bytes calldata data) external onlyOps once returns (uint256 prize) {
        Collection memory c = collections[collection];
        if (!c.listed || c.activeAt > block.timestamp) revert NotAllowed();
        if (price > c.maxPrice) revert TooExpensive();
        if (price > address(this).balance) revert NotEnough();
        if (_owns(collection, tokenId)) revert AlreadyHeld();
        uint256 bal0 = address(this).balance;
        buying = true;
        (bool ok, bytes memory ret) = seaport.call{value: price}(data);
        buying = false;
        if (!ok) revert BuyFailed(ret);
        if (!_owns(collection, tokenId)) revert NotReceived();
        uint256 spent = bal0 - address(this).balance;
        if (spent > price) revert TooExpensive();
        totalSpent += spent;
        prize = _add(collection, tokenId, spent, false);
        emit Bought(prize, collection, tokenId, spent);
    }

    /// @notice NFTs of listed collections sent here with safeTransferFrom become prizes too.
    function onERC721Received(address, address from, uint256 tokenId, bytes calldata) external returns (bytes4) {
        if (!buying && collections[msg.sender].listed && prizeOf[msg.sender][tokenId] == 0) {
            uint256 p = _add(msg.sender, tokenId, 0, true);
            emit Donated(p, msg.sender, tokenId, from);
        }
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @notice An NFT of a listed collection that arrived without safeTransferFrom.
    function register(address collection, uint256 tokenId) external onlyOps returns (uint256 prize) {
        if (!collections[collection].listed) revert NotAllowed();
        if (prizeOf[collection][tokenId] != 0) revert AlreadyHeld();
        if (!_owns(collection, tokenId)) revert NotHeld();
        prize = _add(collection, tokenId, 0, true);
        emit Donated(prize, collection, tokenId, address(0));
    }

    // ------------------------------------------------------------------ raffles

    function open(uint256 prize, bytes32 root, uint128 total, uint64 snapshotBlock, string calldata list) external onlyOps {
        Prize storage p = _prize(prize);
        if (p.status != Status.Held) revert BadStatus();
        if (root == bytes32(0) || total == 0) revert BadRaffle();
        Raffle storage r = _raffles[prize];
        r.root = root; r.total = total; r.snapshotBlock = snapshotBlock;
        r.drawAfter = uint64(block.timestamp + CHALLENGE); r.openedAt = uint64(block.timestamp);
        r.commitHash = bytes32(0); r.commitBlock = 0; r.attempts = 0; r.seed = bytes32(0); r.winner = address(0); r.list = list;
        p.status = Status.Open;
        emit RaffleOpened(prize, root, total, snapshotBlock, r.drawAfter, list);
    }

    /// @notice Takes back a raffle whose list was wrong — only before any draw was tried.
    function cancel(uint256 prize) external onlyOps {
        Prize storage p = _prize(prize);
        if (p.status != Status.Open || _raffles[prize].attempts != 0) revert BadStatus();
        p.status = Status.Held;
        delete _raffles[prize];
        emit RaffleCancelled(prize);
    }

    function commit(uint256 prize, bytes32 commitHash) external onlyOps {
        Prize storage p = _prize(prize);
        if (p.status != Status.Open) revert BadStatus();
        Raffle storage r = _raffles[prize];
        if (block.timestamp < r.drawAfter) revert TooEarly();
        if (commitHash == bytes32(0)) revert BadRaffle();
        uint256 b = _block();
        if (r.commitHash != bytes32(0) && b <= uint256(r.commitBlock) + 1 + REVEAL_WINDOW) revert CommitLive();
        r.commitHash = commitHash;
        r.commitBlock = uint64(b);
        r.attempts += 1;
        emit Committed(prize, commitHash, b, r.attempts);
    }

    /// @notice Anyone holding the secret may reveal it (only the keeper does).
    function reveal(uint256 prize, bytes32 secret) external {
        Prize storage p = _prize(prize);
        if (p.status != Status.Open) revert BadStatus();
        Raffle storage r = _raffles[prize];
        if (r.commitHash == bytes32(0)) revert NoCommit();
        if (keccak256(abi.encode(secret)) != r.commitHash) revert BadSecret();
        uint256 target = uint256(r.commitBlock) + 1;
        uint256 b = _block();
        if (b <= target || b > target + REVEAL_WINDOW) revert RevealWindow();
        bytes32 h = _hash(target);
        if (h == bytes32(0)) revert NoHash();
        _draw(prize, p, r, keccak256(abi.encode(secret, h, r.root, prize)), false);
    }

    /// @notice If no draw has happened a week after the draw time, anyone may draw from the latest block hash.
    function forceDraw(uint256 prize) external {
        Prize storage p = _prize(prize);
        if (p.status != Status.Open) revert BadStatus();
        Raffle storage r = _raffles[prize];
        if (block.timestamp < uint256(r.drawAfter) + STUCK_AFTER) revert TooEarly();
        bytes32 h = _hash(_block() - 1);
        if (h == bytes32(0)) revert NoHash();
        _draw(prize, p, r, keccak256(abi.encode(h, r.root, prize)), true);
    }

    /// @notice Sends the NFT to the wallet whose ticket range holds the drawn ticket. Anyone may call.
    function settle(uint256 prize, address account, uint256 start, uint256 end, bytes32[] calldata proof) external once {
        Prize storage p = _prize(prize);
        if (p.status != Status.Drawn) revert BadStatus();
        Raffle storage r = _raffles[prize];
        uint256 t = uint256(r.seed) % r.total;
        if (t < start || t >= end) revert NotTheTicket();
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, start, end))));
        if (!MerkleProof.verifyCalldata(proof, r.root, leaf)) revert BadProof();
        if (account == address(0)) revert ZeroAddress();
        p.status = Status.Won;
        r.winner = account;
        prizeOf[p.collection][p.tokenId] = 0;
        IERC721(p.collection).transferFrom(address(this), account, p.tokenId);
        emit Won(prize, account, p.collection, p.tokenId);
    }

    // ------------------------------------------------------------------ views

    function prizeCount() external view returns (uint256) { return _prizes.length; }
    function collectionCount() external view returns (uint256) { return collectionList.length; }

    function prizes(uint256 i) external view returns (address collection, uint256 tokenId, uint256 paid, uint256 at, Status status, bool donated) {
        Prize storage p = _prize(i);
        return (p.collection, p.tokenId, p.paid, p.at, p.status, p.donated);
    }

    function raffles(uint256 i) external view returns (bytes32 root, uint256 total, uint256 snapshotBlock, uint256 drawAfter, bytes32 commitHash, uint256 commitBlock,
        uint256 attempts, uint256 openedAt, bytes32 seed, address winner, string memory list) {
        Raffle storage r = _raffles[i];
        return (r.root, r.total, r.snapshotBlock, r.drawAfter, r.commitHash, r.commitBlock, r.attempts, r.openedAt, r.seed, r.winner, r.list);
    }

    /// @notice The drawn ticket (0 before a draw).
    function ticketOf(uint256 prize) external view returns (uint256) {
        Raffle storage r = _raffles[prize];
        return r.seed == bytes32(0) ? 0 : uint256(r.seed) % r.total;
    }

    /// @notice The current block in the numbering commit/reveal use (L2 blocks on Arbitrum).
    function currentBlock() external view returns (uint256) { return _block(); }

    // ------------------------------------------------------------------ internals

    function _draw(uint256 prize, Prize storage p, Raffle storage r, bytes32 seed, bool forced) private {
        r.seed = seed;
        p.status = Status.Drawn;
        emit Drawn(prize, seed, uint256(seed) % r.total, forced);
    }

    function _add(address collection, uint256 tokenId, uint256 paid, bool donated) private returns (uint256 i) {
        i = _prizes.length;
        _prizes.push(Prize(collection, tokenId, uint128(paid), uint64(block.timestamp), Status.Held, donated));
        prizeOf[collection][tokenId] = i + 1;
    }

    function _prize(uint256 i) private view returns (Prize storage) {
        if (i >= _prizes.length) revert BadPrize();
        return _prizes[i];
    }

    function _owns(address collection, uint256 tokenId) private view returns (bool) {
        try IERC721(collection).ownerOf(tokenId) returns (address o) { return o == address(this); } catch { return false; }
    }

    function _block() private view returns (uint256) {
        return address(arbSys) == address(0) ? block.number : arbSys.arbBlockNumber();
    }

    function _hash(uint256 n) private view returns (bytes32) {
        return address(arbSys) == address(0) ? blockhash(n) : arbSys.arbBlockHash(n);
    }
}

/// @title ARCIRCLE NFT fee router — a Pons V2 coin's creator fee recipient
/// @notice A coin launched on Pons V2 names this contract as its `creatorFeeRecipient`. Anyone may call `claim()`: it
///         pulls the coin's creator fees (ETH, or WETH, which it unwraps) out of the Pons Fee Escrow and pays 50% to the
///         ARCIRCLE NFT Vault and 50% to the treasury. The split, the vault and the treasury are fixed at deployment,
///         and Pons only lets the fee recipient move its fees — this contract has no function that does — so the
///         50 / 50 holds for the life of the coin. Fees in any other token go to the treasury. The manager can only
///         turn the coin's Pons buyback on or off (Pons takes that from the fee recipient alone) and hand the role on.
contract ArcircleNftRouter {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    uint16 public constant VAULT_BPS = 5_000;

    INftPonsEscrow public immutable escrow;
    INftPonsFactory public immutable ponsFactory;
    INftWeth public immutable weth; // address(0) if the chain has none
    address payable public immutable vault;
    address payable public immutable treasury;
    address public manager;

    uint256 public toVaultTotal;
    uint256 public toTreasuryTotal;
    uint256 private lock = 1;

    event Split(uint256 toVault, uint256 toTreasury);
    event TokenToTreasury(address indexed token, uint256 amount);
    event ManagerSet(address indexed manager);

    error NotManager();
    error ZeroAddress();
    error Reentered();
    error PayFailed(address to);
    error UseClaim();

    modifier once() { if (lock != 1) revert Reentered(); lock = 2; _; lock = 1; }

    constructor(address _escrow, address _ponsFactory, address _weth, address payable _vault, address payable _treasury, address _manager) {
        if (_escrow == address(0) || _ponsFactory == address(0) || _vault == address(0) || _treasury == address(0) || _manager == address(0)) revert ZeroAddress();
        escrow = INftPonsEscrow(_escrow);
        ponsFactory = INftPonsFactory(_ponsFactory);
        weth = INftWeth(_weth);
        vault = _vault;
        treasury = _treasury;
        manager = _manager;
        emit ManagerSet(_manager);
    }

    receive() external payable {}

    /// @notice Pulls the fees out of the Pons escrow and splits all the ETH here, 50 / 50.
    function claim() external once returns (uint256 toVault, uint256 toTreasury) {
        if (escrow.balanceOf(address(this)) > 0) escrow.claim();
        if (address(weth) != address(0)) {
            if (escrow.balanceOfToken(address(this), address(weth)) > 0) escrow.claimToken(address(weth));
            uint256 w = weth.balanceOf(address(this));
            if (w > 0) weth.withdraw(w);
        }
        uint256 bal = address(this).balance;
        if (bal == 0) return (0, 0);
        toVault = (bal * VAULT_BPS) / BPS;
        toTreasury = bal - toVault;
        toVaultTotal += toVault;
        toTreasuryTotal += toTreasury;
        _send(vault, toVault);
        _send(treasury, toTreasury);
        emit Split(toVault, toTreasury);
    }

    /// @notice Fees credited in another token go to the treasury (the vault buys NFTs with ETH).
    function claimToken(address token) external once returns (uint256 amount) {
        if (token == address(weth)) revert UseClaim();
        if (escrow.balanceOfToken(address(this), token) > 0) escrow.claimToken(token);
        amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) return 0;
        IERC20(token).safeTransfer(treasury, amount);
        emit TokenToTreasury(token, amount);
    }

    /// @notice ETH a claim would split now (escrow ETH + escrow WETH + what's here).
    function pending() external view returns (uint256 p) {
        p = escrow.balanceOf(address(this)) + address(this).balance;
        if (address(weth) != address(0)) p += escrow.balanceOfToken(address(this), address(weth)) + weth.balanceOf(address(this));
    }

    function setBuybackEnabled(address token, bool enabled) external {
        if (msg.sender != manager) revert NotManager();
        ponsFactory.setBuybackEnabled(token, enabled);
    }

    function setManager(address next) external {
        if (msg.sender != manager) revert NotManager();
        if (next == address(0)) revert ZeroAddress();
        manager = next;
        emit ManagerSet(next);
    }

    function _send(address payable to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert PayFailed(to);
    }
}
