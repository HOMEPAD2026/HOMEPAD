// MK1: buy $ARCIRCLE with USDC — the calldata the game builds by hand equals ethers' ABI encoding for ArcircleSwap
import { createRequire } from "node:module";
import { SEL, encQuote, encSwap, encApprove, encAllowance, decKey, decQuote, usdcFor, minOutOf, pathFor, keyWords } from "../../world-buyarc.js";
const require = createRequire(import.meta.url);
const { Interface, AbiCoder, id } = require("ethers");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };
const KEY_T = "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
const I = new Interface([`function swap(${KEY_T}[] path,address tokenIn,uint256 amountIn,uint256 minOut,address to,uint256 deadline) returns (uint256)`, `function quote(${KEY_T}[] path,address tokenIn,uint256 amountIn,address payer)`, "error QuoteResult(uint256 out, uint256 fee, uint256 feeAt)", "function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"]);
const USDC = "0x3600000000000000000000000000000000000000", ARC = "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7", ME = "0x1250000000000000000000000000000000aac1aa", SW = "0x305da1b305249072b13b73ab394e02046c865d56";
const key = { currency0: USDC, currency1: ARC, fee: 3000, tickSpacing: -60, hooks: "0x484d416e73eb44d276ddef04cdbadf2f4907c044" };
const key2 = { currency0: USDC, currency1: ARC, fee: 0, tickSpacing: 200, hooks: "0x0000000000000000000000000000000000000000" };
ok(SEL.quote === id(`quote((address,address,uint24,int24,address)[],address,uint256,address)`).slice(0, 10), "quote selector");
ok(SEL.swap === id(`swap((address,address,uint24,int24,address)[],address,uint256,uint256,address,uint256)`).slice(0, 10), "swap selector");
ok(SEL.quoteResult === id("QuoteResult(uint256,uint256,uint256)").slice(0, 10), "QuoteResult selector");
ok(SEL.poolKey === id("poolKey()").slice(0, 10), "poolKey selector");
ok(encQuote([key], USDC, 1234567n, ME).toLowerCase() === I.encodeFunctionData("quote", [[key], USDC, 1234567n, ME]).toLowerCase(), "quote calldata = ethers (negative tickSpacing)");
ok(encSwap([key, key2], USDC, 5000000n, 999n, ME, 1793700000).toLowerCase() === I.encodeFunctionData("swap", [[key, key2], USDC, 5000000n, 999n, ME, 1793700000]).toLowerCase(), "swap calldata = ethers (two hops)");
ok(encApprove(SW, 77n).toLowerCase() === I.encodeFunctionData("approve", [SW, 77n]).toLowerCase(), "approve calldata");
ok(encAllowance(ME, SW).toLowerCase() === I.encodeFunctionData("allowance", [ME, SW]).toLowerCase(), "allowance calldata");
const kHex = "0x" + keyWords(key), dk = decKey(kHex);
ok(dk && dk.currency0 === USDC && dk.currency1 === ARC && dk.fee === 3000 && dk.tickSpacing === -60 && dk.hooks === key.hooks, "poolKey() decodes back (negative tickSpacing)");
const rev = I.encodeErrorResult("QuoteResult", [123456789012345678901n, 42n, 1n]), dq = decQuote(rev);
ok(dq && dq.out === 123456789012345678901n && dq.fee === 42n && dq.feeAt === 1, "QuoteResult revert decodes");
ok(decQuote("0x2746152a" + "00".repeat(64)) === null, "another revert (Slippage) isn't read as a quote");
// sizing: 1 USDC → 2,000 $ARCIRCLE; short 100,000 $ARCIRCLE → 50 USDC + 2.5 % → 51.25, rounded up to the cent
const amt = usdcFor(100000n * 10n ** 18n, 1000000n, 2000n * 10n ** 18n);
ok(amt === 51250000n, "USDC sized to cover the shortfall + 2.5 % (" + amt + ")");
ok(usdcFor(0n, 1000000n, 1n) === 0n && usdcFor(5n, 1000000n, 0n) === null, "nothing short → 0; no price → null");
ok(minOutOf(1000000n) === 990000n, "1 % slippage floor");
ok(pathFor({ ...key, currency0: ARC.toUpperCase().replace("0X", "0x"), currency1: USDC }, USDC, ARC) !== null && pathFor({ ...key, currency1: "0x" + "1".repeat(40) }, USDC, ARC) === null, "the fee-burn pool is used only when it pairs USDC and $ARCIRCLE");
// world-play: a short $ARCIRCLE transfer goes through the buy sheet first; the shop asks it too
const fs = await import("node:fs"), wp = fs.readFileSync(new URL("../../world-play.js", import.meta.url), "utf8"), shop = fs.readFileSync(new URL("../../world-shop.js", import.meta.url), "utf8");
ok(/async function walletTx\(to, data, opts = \{\}\)/.test(wp) && /!opts\.noBuy && \/\^0xa9059cbb\/i/.test(wp) && /await buyArc\(need, opts\.label\)/.test(wp), "walletTx checks a $ARCIRCLE transfer and opens the buy sheet when short");
ok(/tx: \(t, d\) => walletTx\(t, d, \{ noBuy: true \}\)/.test(wp), "the sheet's own approve / swap skip the check (no loop)");
ok(/ctx\.buyArc && \(await ctx\.buyArc\(BigInt\(q\.j\.amount\)\)\)/.test(shop), "the town shop offers it when short");
console.log(`${pass} pass ${fail} fail`); if (fail) process.exit(1);
