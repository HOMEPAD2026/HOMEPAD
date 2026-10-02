// tools/pump-kit/server-entry.mjs → api/_solkit.mjs: what the server's Solana code (api/_orders-sol.mjs) needs from
// @solana/web3.js and @solana/spl-token, bundled so the functions need no npm install. Rebuild: npm run build:server
import { PublicKey, Keypair, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram, ComputeBudgetProgram, AddressLookupTableAccount, AddressLookupTableProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, createCloseAccountInstruction, createApproveCheckedInstruction, createSyncNativeInstruction, unpackAccount, unpackMint } from "@solana/spl-token";
import { ordersSol, ORDER_DISC_B58 } from "./orders-sol.mjs";
export const web3 = { PublicKey, Keypair, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram, ComputeBudgetProgram, AddressLookupTableAccount, AddressLookupTableProgram, LAMPORTS_PER_SOL };
export const spl = { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, createCloseAccountInstruction, createApproveCheckedInstruction, createSyncNativeInstruction, unpackAccount, unpackMint };
export { ordersSol, ORDER_DISC_B58 };
