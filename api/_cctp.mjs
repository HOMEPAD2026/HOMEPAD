// api/_cctp.mjs — a thin, validated proxy to Circle's CCTP attestation API
// (Iris) for the Bridge utility (arc-bridge.js), served through /api/social:
//
//   GET /api/social?cctp=fees&src=6&dst=26   → Iris /v2/burn/USDC/fees/6/26?forward=true
//   GET /api/social?cctp=msg&src=6&tx=0x…    → Iris /v2/messages/6?transactionHash=0x…
//
// Only the CCTP domains the Bridge offers are accepted. Nothing is stored;
// fee quotes are edge-cached for a minute, message status never.
const IRIS = "https://iris-api.circle.com";
// Arc 26 · Ethereum 0 · Avalanche 1 · OP 2 · Arbitrum 3 · Base 6 · Polygon 7 · Unichain 10 · Linea 11
export const DOMAINS = new Set([26, 0, 1, 2, 3, 6, 7, 10, 11]);
const dom = (v) => { const n = Number(v); return Number.isInteger(n) && DOMAINS.has(n) ? n : null; };

async function iris(path) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(IRIS + path, { signal: ctl.signal, headers: { accept: "application/json" } });
    const text = await r.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }
    return { status: r.status, body };
  } finally { clearTimeout(t); }
}

/// → [status, body, cacheControl]
export async function cctp(params) {
  const kind = params.get("cctp");
  const src = dom(params.get("src"));
  if (src == null) return [400, { error: "unsupported source chain" }, "no-store"];
  if (kind === "fees") {
    const dst = dom(params.get("dst"));
    if (dst == null || dst === src || (src !== 26 && dst !== 26)) return [400, { error: "one side of the bridge must be Arc" }, "no-store"];
    const r = await iris(`/v2/burn/USDC/fees/${src}/${dst}?forward=true`);
    if (r.status !== 200 || !Array.isArray(r.body)) return [502, { error: "couldn't get a fee quote from Circle" }, "no-store"];
    const fees = r.body.map((f) => {
      const fw = f && f.forwardFee;
      return {
        finalityThreshold: Number(f.finalityThreshold), minimumFee: Number(f.minimumFee) || 0,
        forwardFee: fw ? { low: Number(fw.low), med: Number(fw.med != null ? fw.med : fw.medium), high: Number(fw.high) } : null,
      };
    }).filter((f) => f.finalityThreshold === 1000 || f.finalityThreshold === 2000);
    return [200, { src, dst, fees, at: Date.now() }, "public, max-age=30, s-maxage=60, stale-while-revalidate=120"];
  }
  if (kind === "msg") {
    const tx = String(params.get("tx") || "");
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return [400, { error: "bad transaction hash" }, "no-store"];
    const r = await iris(`/v2/messages/${src}?transactionHash=${tx}`);
    // Iris answers 404 until it has seen the burn
    if (r.status === 404) return [200, { status: "not_found", messages: [] }, "no-store"];
    if (r.status !== 200 || !r.body || !Array.isArray(r.body.messages)) return [502, { error: "couldn't reach Circle's attestation service" }, "no-store"];
    const messages = r.body.messages.map((m) => {
      const out = {
        status: m.status || null, delayReason: m.delayReason || null,
        message: m.message && m.message !== "0x" ? m.message : null,
        attestation: m.attestation && m.attestation !== "PENDING" ? m.attestation : null,
        dstDomain: m.decodedMessage ? Number(m.decodedMessage.destinationDomain) : null,
        amount: m.decodedMessage && m.decodedMessage.decodedMessageBody ? m.decodedMessage.decodedMessageBody.amount : null,
        feeExecuted: m.decodedMessage && m.decodedMessage.decodedMessageBody ? m.decodedMessage.decodedMessageBody.feeExecuted : null,
        mintRecipient: m.decodedMessage && m.decodedMessage.decodedMessageBody ? m.decodedMessage.decodedMessageBody.mintRecipient : null,
      };
      // forwarding status, whatever Iris calls it
      for (const k of Object.keys(m)) {
        if (/forward/i.test(k) && /(hash|tx)/i.test(k) && /^0x[0-9a-fA-F]{64}$/.test(String(m[k]))) out.forwardTx = m[k];
        else if (/forward/i.test(k) && /(state|status)/i.test(k)) out.forwardState = String(m[k]);
      }
      return out;
    });
    return [200, { status: "ok", messages }, "no-store"];
  }
  return [400, { error: "unknown cctp request" }, "no-store"];
}
