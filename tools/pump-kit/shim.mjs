// esbuild --inject: Buffer for @solana/web3.js in the browser
import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = Buffer;
export { Buffer };
