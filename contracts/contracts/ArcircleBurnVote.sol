// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBurnVoteBallot {
    function escrow() external view returns (address);
    function votingEnds() external view returns (uint256);
    function optionsSet(uint8 category) external view returns (bool);
    function options(uint8 category) external view returns (string[] memory);
}

interface IBurnVoteEscrow {
    function deadline() external view returns (uint256);
}

interface IBurnVoteToken {
    function decimals() external view returns (uint8);
    function balanceOf(address) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Burn-to-vote for a CirclePad round: every vote costs exactly
/// 1,000 $ARCIRCLE, sent straight from the voter to the dead address
/// (0x…dEaD) inside the vote transaction. Anyone holding $ARCIRCLE can
/// vote, as many times as they like, split across any options.
///
/// The candidates and the voting window come from the round's existing
/// BigPadVote (the "ballot"): the recipient still publishes candidates there
/// with proposeOptions, and voting runs from the escrow's deadline (the
/// raise closing) to ballot.votingEnds(). This contract only counts burned
/// votes — it holds no tokens and has no owner, admin or withdraw.
///
/// Votes can't be changed or taken back: the tokens behind them are gone.
contract ArcircleBurnVote {
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant TOKENS_PER_VOTE = 1000;
    uint8 public constant CATEGORY_COUNT = 5;

    IBurnVoteBallot public immutable ballot;
    IBurnVoteToken public immutable token;
    /// @notice Raw token units burned per vote (1,000 × 10^decimals).
    uint256 public immutable votePrice;
    /// @notice Voting opens when the raise closes (the escrow's deadline).
    uint256 public immutable opensAt;
    uint256 public immutable votingEnds;

    /// @notice category → option → votes
    mapping(uint8 => mapping(uint256 => uint256)) public optionVotes;
    /// @notice category → voter → option → votes
    mapping(uint8 => mapping(address => mapping(uint256 => uint256))) public votesOf;
    /// @notice category → total votes cast in it
    mapping(uint8 => uint256) public categoryVotes;
    mapping(address => uint256) public burnedBy;
    uint256 public totalVotes;
    uint256 public totalBurned;
    uint256 public voterCount;

    event Voted(uint8 indexed category, address indexed voter, uint256 indexed optionIndex, uint256 votes, uint256 burned);

    error InvalidCategory();
    error OptionsNotSet();
    error InvalidOption();
    error NoVotes();
    error VotingNotOpenYet();
    error VotingClosed();
    error LengthMismatch();
    error BurnFailed();

    constructor(address ballot_, address token_) {
        require(ballot_ != address(0) && token_ != address(0), "zero address");
        IBurnVoteBallot b = IBurnVoteBallot(ballot_);
        uint256 opens = IBurnVoteEscrow(b.escrow()).deadline();
        uint256 ends = b.votingEnds();
        require(opens > 0 && ends > opens, "ballot has no window");
        ballot = b;
        token = IBurnVoteToken(token_);
        votePrice = TOKENS_PER_VOTE * (10 ** uint256(IBurnVoteToken(token_).decimals()));
        opensAt = opens;
        votingEnds = ends;
    }

    /// @notice Burn `votes` × 1,000 $ARCIRCLE for one option. Approve this
    /// contract for at least that much first.
    function vote(uint8 category, uint256 optionIndex, uint256 votes) external {
        uint8[] memory c = new uint8[](1);
        uint256[] memory o = new uint256[](1);
        uint256[] memory n = new uint256[](1);
        c[0] = category; o[0] = optionIndex; n[0] = votes;
        _vote(c, o, n);
    }

    /// @notice Several votes in one transaction (e.g. one per category) —
    /// a single burn for the total.
    function voteMany(uint8[] calldata categories, uint256[] calldata optionIndexes, uint256[] calldata votes) external {
        if (categories.length != optionIndexes.length || categories.length != votes.length) revert LengthMismatch();
        _vote(categories, optionIndexes, votes);
    }

    function _vote(uint8[] memory categories, uint256[] memory optionIndexes, uint256[] memory votes) internal {
        if (block.timestamp < opensAt) revert VotingNotOpenYet();
        if (block.timestamp >= votingEnds) revert VotingClosed();
        uint256 total;
        for (uint256 i = 0; i < categories.length; i++) {
            uint8 cat = categories[i];
            if (cat >= CATEGORY_COUNT) revert InvalidCategory();
            if (!ballot.optionsSet(cat)) revert OptionsNotSet();
            if (optionIndexes[i] >= ballot.options(cat).length) revert InvalidOption();
            if (votes[i] == 0) revert NoVotes();
            total += votes[i];
        }
        if (total == 0) revert NoVotes();

        uint256 amount = total * votePrice;
        _burnFrom(msg.sender, amount);

        if (burnedBy[msg.sender] == 0) voterCount++;
        burnedBy[msg.sender] += amount;
        totalBurned += amount;
        totalVotes += total;
        for (uint256 i = 0; i < categories.length; i++) {
            uint8 cat = categories[i];
            optionVotes[cat][optionIndexes[i]] += votes[i];
            votesOf[cat][msg.sender][optionIndexes[i]] += votes[i];
            categoryVotes[cat] += votes[i];
            emit Voted(cat, msg.sender, optionIndexes[i], votes[i], votes[i] * votePrice);
        }
    }

    /// @dev transferFrom(voter → dead) and a check that the dead address got
    /// exactly that much — a vote is only counted for tokens actually burned.
    function _burnFrom(address from, uint256 amount) internal {
        uint256 before = token.balanceOf(DEAD);
        (bool ok, bytes memory ret) = address(token).call(abi.encodeWithSelector(IBurnVoteToken.transferFrom.selector, from, DEAD, amount));
        if (!ok || (ret.length > 0 && !abi.decode(ret, (bool)))) revert BurnFailed();
        if (token.balanceOf(DEAD) - before != amount) revert BurnFailed();
    }

    // ---- views ----

    function votingOpen() external view returns (bool) {
        return block.timestamp >= opensAt && block.timestamp < votingEnds;
    }

    /// @notice Votes per option for a category, in the ballot's order.
    function tallies(uint8 category) external view returns (uint256[] memory out) {
        if (category >= CATEGORY_COUNT) revert InvalidCategory();
        uint256 len = ballot.optionsSet(category) ? ballot.options(category).length : 0;
        out = new uint256[](len);
        for (uint256 i = 0; i < len; i++) out[i] = optionVotes[category][i];
    }

    /// @notice A voter's votes per option for a category.
    function myVotes(uint8 category, address voter) external view returns (uint256[] memory out) {
        if (category >= CATEGORY_COUNT) revert InvalidCategory();
        uint256 len = ballot.optionsSet(category) ? ballot.options(category).length : 0;
        out = new uint256[](len);
        for (uint256 i = 0; i < len; i++) out[i] = votesOf[category][voter][i];
    }

    /// @notice The option ahead in a category; ties go to the one published first.
    function leading(uint8 category) external view returns (uint256 optionIndex, uint256 votes) {
        if (category >= CATEGORY_COUNT) revert InvalidCategory();
        uint256 len = ballot.optionsSet(category) ? ballot.options(category).length : 0;
        for (uint256 i = 0; i < len; i++) {
            uint256 v = optionVotes[category][i];
            if (v > votes) { votes = v; optionIndex = i; }
        }
    }
}
