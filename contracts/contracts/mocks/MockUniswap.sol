// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Minimal mocks of Uniswap V2's router/factory/pair, ONLY for local testing
// the graduation flow. Do not deploy these anywhere real — point the real
// factory constructor at Robinhood Chain's actual Uniswap V2 router address.

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockPair is ERC20 {
    constructor() ERC20("Mock LP", "MLP") {}
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    receive() external payable {}
}

contract MockFactory {
    mapping(address => mapping(address => address)) public pairs;

    function getPair(address a, address b) external view returns (address) {
        return pairs[a][b] != address(0) ? pairs[a][b] : pairs[b][a];
    }

    function createPair(address a, address b) external returns (address) {
        if (pairs[a][b] != address(0)) return pairs[a][b];
        MockPair p = new MockPair();
        pairs[a][b] = address(p);
        pairs[b][a] = address(p);
        return address(p);
    }
}

contract MockRouter {
    MockFactory public immutable mockFactory;
    address public immutable weth;

    constructor(address factory_, address weth_) {
        mockFactory = MockFactory(factory_);
        weth = weth_;
    }

    function factory() external view returns (address) {
        return address(mockFactory);
    }

    function WETH() external view returns (address) {
        return weth;
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256,
        uint256,
        address to,
        uint256
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        address pairAddr = mockFactory.getPair(token, weth);
        if (pairAddr == address(0)) {
            pairAddr = mockFactory.createPair(token, weth);
        }
        require(IERC20(token).transferFrom(msg.sender, pairAddr, amountTokenDesired), "token pull failed");
        (bool sent, ) = pairAddr.call{value: msg.value}("");
        require(sent, "eth send failed");

        liquidity = amountTokenDesired > msg.value ? msg.value : amountTokenDesired; // toy invariant, test-only
        MockPair(payable(pairAddr)).mint(to, liquidity);

        return (amountTokenDesired, msg.value, liquidity);
    }

    /// @notice Mock of the ERC20/ERC20 addLiquidity path used by stock-paired curves.
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256,
        uint256,
        address to,
        uint256
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        address pairAddr = mockFactory.getPair(tokenA, tokenB);
        if (pairAddr == address(0)) {
            pairAddr = mockFactory.createPair(tokenA, tokenB);
        }
        require(IERC20(tokenA).transferFrom(msg.sender, pairAddr, amountADesired), "tokenA pull failed");
        require(IERC20(tokenB).transferFrom(msg.sender, pairAddr, amountBDesired), "tokenB pull failed");

        liquidity = amountADesired > amountBDesired ? amountBDesired : amountADesired; // toy invariant, test-only
        MockPair(payable(pairAddr)).mint(to, liquidity);

        return (amountADesired, amountBDesired, liquidity);
    }
}

/// @notice Stand-in for a Robinhood Stock Token — a plain 18-decimal ERC-20,
///         which is genuinely all a Stock Token is on the ABI level.
contract MockStockToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _mint(msg.sender, 1_000_000 ether);
    }
    // test-only: lets a CREATE2-deployed instance (whose constructor mint went
    // to the deployer contract) fund test wallets
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
