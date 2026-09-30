// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// test-only: WETH9-like wrapped ETH
contract MockWETH is ERC20 {
    constructor() ERC20("Wrapped Ether", "WETH") {}
    function deposit() external payable { _mint(msg.sender, msg.value); }
    function withdraw(uint256 a) external { _burn(msg.sender, a); (bool ok, ) = msg.sender.call{value: a}(""); require(ok, "eth"); }
    receive() external payable { _mint(msg.sender, msg.value); }
}

interface IV3FactoryCreate { function createPool(address a, address b, uint24 fee) external returns (address); }
interface IV3PoolInit { function initialize(uint160 sqrtPriceX96) external; }

/// test-only: a pons-like launch factory registry (getLaunchedToken's struct as documented by pons)
contract MockPonsFactory {
    struct Launched {
        address token; address deployer; address pairedToken; address positionManager; uint256 positionId; uint256 dexId;
        uint256 launchConfigId; uint256 restrictionsEndBlock; uint256 supply; bool isToken0; uint24 poolFee; bool exists; uint256 initialBuyAmount;
    }
    mapping(address => Launched) internal l;
    event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId,
        uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount);
    function register(address token, address paired, address dexFactory, address pool, uint256 endBlock) external {
        l[token] = Launched(token, msg.sender, paired, address(0), 1, 0, 0, endBlock, 1e27, token < paired, 10000, true, 0);
        emit TokenLaunched(token, msg.sender, dexFactory, paired, pool, 0, 0, 1, endBlock, 0);
    }
    function getLaunchedToken(address token) external view returns (Launched memory) { return l[token]; }
    /// like a pons launch: the v3 pool (1% fee) is created and priced, then the launch is announced — one transaction
    function launch(address token, address paired, address dexFactory, uint160 sqrtPriceX96) external returns (address pool) {
        pool = IV3FactoryCreate(dexFactory).createPool(token, paired, 10000);
        IV3PoolInit(pool).initialize(sqrtPriceX96);
        l[token] = Launched(token, msg.sender, paired, address(0), 1, 0, 0, block.number + 2, 1e27, token < paired, 10000, true, 0);
        emit TokenLaunched(token, msg.sender, dexFactory, paired, pool, 0, 0, 1, block.number + 2, 0);
    }
}

interface IV3PoolMint {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function mint(address recipient, int24 tickLower, int24 tickUpper, uint128 amount, bytes calldata data) external returns (uint256, uint256);
    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes calldata data) external returns (int256, int256);
}

/// test-only: adds liquidity to a v3 pool and makes plain swaps (someone else trading)
contract V3Helper {
    function mint(address pool, int24 lo, int24 hi, uint128 amount) external {
        IV3PoolMint(pool).mint(address(this), lo, hi, amount, abi.encode(msg.sender));
    }
    function uniswapV3MintCallback(uint256 a0, uint256 a1, bytes calldata data) external {
        address payer = abi.decode(data, (address));
        if (a0 > 0) IERC20(IV3PoolMint(msg.sender).token0()).transferFrom(payer, msg.sender, a0);
        if (a1 > 0) IERC20(IV3PoolMint(msg.sender).token1()).transferFrom(payer, msg.sender, a1);
    }
    function swap(address pool, bool zeroForOne, uint256 amountIn) external {
        IV3PoolMint(pool).swap(msg.sender, zeroForOne, int256(amountIn), zeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341, abi.encode(msg.sender));
    }
    function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata data) external {
        address payer = abi.decode(data, (address));
        if (a0 > 0) IERC20(IV3PoolMint(msg.sender).token0()).transferFrom(payer, msg.sender, uint256(a0));
        if (a1 > 0) IERC20(IV3PoolMint(msg.sender).token1()).transferFrom(payer, msg.sender, uint256(a1));
    }
}
