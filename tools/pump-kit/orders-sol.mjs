// ARCIRCLE Orders on Solana — the client side of solana/arcircle-orders (instruction builders, account decoders).
// Shared by the browser kit (vendor/pump-kit.js → arc-orders.js) and the keeper (api/_solkit.mjs → api/_orders-sol.mjs).
// Pass in web3.js and spl-token so both bundles use their own copies.
//   const O = ordersSol({ web3, spl, programId })
//   O.place({ owner, nonce, side, mint, source, amountIn, minOut, expiry })   → TransactionInstruction
//   O.fillStart({ ... }), O.fillEnd({ ... }), O.cancel(...), O.closeExpired(...), O.initConfig(...), O.setConfig(...)
//   O.decodeOrder(data), O.decodeConfig(data), O.orderPda(owner, nonce), O.configPda, O.authPda
const DISC = {
  init_config: [23, 235, 115, 232, 168, 96, 1, 231], set_config: [108, 158, 154, 175, 212, 98, 52, 66], set_treasury: [57, 97, 196, 95, 195, 206, 106, 136],
  place: [143, 53, 56, 40, 41, 16, 5, 75], cancel: [232, 219, 223, 41, 219, 236, 220, 190], close_expired: [138, 186, 164, 245, 32, 116, 162, 62],
  fill_start: [203, 81, 19, 217, 75, 68, 166, 90], fill_end: [241, 68, 190, 82, 114, 12, 248, 31],
};
const ACCT = { config: [155, 12, 170, 224, 30, 250, 204, 130], order: [134, 173, 223, 185, 77, 86, 28, 51] };
const EVENT = { placed: [96, 130, 204, 234, 169, 219, 216, 227], filled: [120, 124, 109, 66, 249, 116, 174, 30], closed: [237, 77, 101, 123, 72, 43, 149, 123] };
export const ORDER_SIZE = 131, CONFIG_SIZE = 149, BUY = 0, SELL = 1;
const BPF_UPGRADEABLE = "BPFLoaderUpgradeab1e11111111111111111111111";
const SYSVAR_IX = "Sysvar1nstructions1111111111111111111111111";

export function ordersSol({ web3, spl, programId }) {
  const { PublicKey, TransactionInstruction, SystemProgram } = web3;
  const PROGRAM = new PublicKey(programId);
  const pk = (x) => (x instanceof PublicKey ? x : new PublicKey(x));
  const u64 = (v) => { const b = new Uint8Array(8); let n = BigInt(v); for (let i = 0; i < 8; i++) { b[i] = Number(n & 0xffn); n >>= 8n; } return b; };
  const i64 = (v) => u64(BigInt.asUintN(64, BigInt(v)));
  const u16 = (v) => Uint8Array.of(v & 0xff, (v >> 8) & 0xff);
  const cat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; };
  const data = (name, ...args) => Buffer.from(cat(Uint8Array.from(DISC[name]), ...args));
  const m = (pubkey, isWritable, isSigner) => ({ pubkey: pk(pubkey), isWritable: !!isWritable, isSigner: !!isSigner });
  const ix = (keys, d) => new TransactionInstruction({ programId: PROGRAM, keys, data: d });
  const configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM)[0];
  const authPda = PublicKey.findProgramAddressSync([Buffer.from("auth")], PROGRAM)[0];
  const orderPda = (owner, nonce) => PublicKey.findProgramAddressSync([Buffer.from("order"), pk(owner).toBuffer(), Buffer.from(u64(nonce))], PROGRAM)[0];
  const programData = PublicKey.findProgramAddressSync([PROGRAM.toBuffer()], new PublicKey(BPF_UPGRADEABLE))[0];
  const WSOL = spl.NATIVE_MINT;

  const rd = (b) => { const v = new DataView(b.buffer, b.byteOffset, b.byteLength); let o = 0;
    return { key: () => { const k = new PublicKey(b.subarray(o, o + 32)); o += 32; return k.toBase58(); }, u8: () => b[o++], u16: () => { const x = v.getUint16(o, true); o += 2; return x; },
      u64: () => { const x = v.getBigUint64(o, true); o += 8; return x; }, i64: () => { const x = v.getBigInt64(o, true); o += 8; return x; }, skip: (n) => { o += n; } }; };
  const isDisc = (b, d) => b && b.length >= 8 && d.every((x, i) => b[i] === x);
  function decodeOrder(b) {
    b = Uint8Array.from(b);
    if (!isDisc(b, ACCT.order) || b.length < ORDER_SIZE) return null;
    const r = rd(b); r.skip(8);
    return { owner: r.key(), nonce: r.u64(), side: r.u8(), mint: r.key(), amountIn: r.u64(), minOut: r.u64(), expiry: Number(r.i64()), created: Number(r.i64()), state: r.u8(), preDest: r.u64(), preTreasury: r.u64(), bump: r.u8() };
  }
  function decodeConfig(b) {
    b = Uint8Array.from(b);
    if (!isDisc(b, ACCT.config) || b.length < CONFIG_SIZE) return null;
    const r = rd(b); r.skip(8);
    return { admin: r.key(), keeper: r.key(), treasury: r.key(), treasuryWsol: r.key(), feeBps: r.u16(), maxIn: r.u64(), paused: r.u8() === 1, bump: r.u8(), authBump: r.u8() };
  }
  /// "Program data: <base64>" log lines → events
  function decodeEvents(logs) {
    const out = [];
    for (const l of logs || []) {
      const mm = /^Program data: (.+)$/.exec(l);
      if (!mm) continue;
      let b; try { b = Uint8Array.from(atob(mm[1]), (c) => c.charCodeAt(0)); } catch { continue; }
      const r = rd(b); r.skip(8);
      if (isDisc(b, EVENT.placed)) out.push({ kind: "placed", order: r.key(), owner: r.key(), mint: r.key(), side: r.u8(), amountIn: r.u64(), minOut: r.u64(), expiry: Number(r.i64()) });
      else if (isDisc(b, EVENT.filled)) out.push({ kind: "filled", order: r.key(), owner: r.key(), mint: r.key(), side: r.u8(), amountIn: r.u64(), out: r.u64(), filler: r.key() });
      else if (isDisc(b, EVENT.closed)) out.push({ kind: "closed", order: r.key(), owner: r.key(), filled: r.u8() === 1 });
    }
    return out;
  }

  return {
    PROGRAM, configPda, authPda, orderPda, programData, WSOL, decodeOrder, decodeConfig, decodeEvents, ORDER_SIZE, CONFIG_SIZE, BUY, SELL,
    /// GPA filters: every order, or one owner's
    orderFilters: (owner) => [{ dataSize: ORDER_SIZE }, { memcmp: { offset: 0, bytes: ORDER_DISC_B58 } }, ...(owner ? [{ memcmp: { offset: 8, bytes: pk(owner).toBase58() } }] : [])],
    initConfig: ({ admin, treasuryWsol, keeper, feeBps, maxIn }) => ix(
      [m(admin, 1, 1), m(configPda, 1), m(treasuryWsol), m(PROGRAM), m(programData), m(SystemProgram.programId)],
      data("init_config", pk(keeper || PublicKey.default).toBytes(), u16(feeBps), u64(maxIn))),
    setConfig: ({ admin, keeper, feeBps, maxIn, paused, newAdmin }) => ix(
      [m(admin, 0, 1), m(configPda, 1)],
      data("set_config", pk(keeper || PublicKey.default).toBytes(), u16(feeBps), u64(maxIn), Uint8Array.of(paused ? 1 : 0), pk(newAdmin || admin).toBytes())),
    setTreasury: ({ admin, treasuryWsol }) => ix([m(admin, 0, 1), m(configPda, 1), m(treasuryWsol)], data("set_treasury")),
    place: ({ owner, nonce, side, mint, source, amountIn, minOut, expiry = 0 }) => ix(
      [m(owner, 1, 1), m(configPda), m(orderPda(owner, nonce), 1), m(mint), m(source), m(authPda), m(SystemProgram.programId)],
      data("place", u64(nonce), Uint8Array.of(side), u64(amountIn), u64(minOut), i64(expiry))),
    cancel: ({ owner, order }) => ix([m(owner, 1, 1), m(order, 1)], data("cancel")),
    closeExpired: ({ caller, owner, order }) => ix([m(caller, 0, 1), m(owner, 1), m(order, 1)], data("close_expired")),
    fillStart: ({ filler, order, inMint, outMint, source, fillerIn, treasuryWsol, treasury, ownerDest, tokenProgram }) => ix(
      [m(filler, 1, 1), m(configPda), m(order, 1), m(authPda), m(inMint), m(outMint), m(source, 1), m(fillerIn, 1), m(treasuryWsol, 1), m(treasury), m(ownerDest), m(tokenProgram), m(SYSVAR_IX)],
      data("fill_start")),
    fillEnd: ({ filler, order, owner, ownerDest, treasury }) => ix(
      [m(filler, 0, 1), m(configPda), m(order, 1), m(owner, 1), m(ownerDest), m(treasury), m(SYSVAR_IX)],
      data("fill_end")),
  };
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58(bytes) {
  let n = 0n; for (const x of bytes) n = n * 256n + BigInt(x);
  let s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of bytes) { if (x !== 0) break; s = "1" + s; }
  return s;
}
export const ORDER_DISC_B58 = b58(ACCT.order);
