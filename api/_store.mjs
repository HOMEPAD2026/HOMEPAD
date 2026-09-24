// api/_store.mjs — minimal Firestore client over REST for the Node functions.
// Authenticates as a service account (env FIREBASE_SERVICE_ACCOUNT: the JSON
// key file's contents, raw or base64). No client ever talks to Firestore
// directly: every write goes through a function that checked a signature
// first, so the security rules can stay closed.
import { createSign } from "node:crypto";

let SA = null, saErr = null;
function account() {
  if (SA || saErr) return SA;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) return null;
  try {
    const txt = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const j = JSON.parse(txt);
    if (!j.client_email || !j.private_key || !j.project_id) throw new Error("incomplete key");
    SA = { email: j.client_email, key: j.private_key.replace(/\\n/g, "\n"), project: j.project_id };
  } catch (err) { saErr = String(err.message || err); console.error("FIREBASE_SERVICE_ACCOUNT unreadable:", saErr); }
  return SA;
}
export const storeEnabled = () => !!account();

const b64u = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
let tok = null, tokExp = 0;
async function accessToken() {
  const sa = account();
  if (!sa) throw new Error("store not configured");
  const now = Math.floor(Date.now() / 1000);
  if (tok && tokExp - 60 > now) return tok;
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: sa.email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = b64u(createSign("RSA-SHA256").update(`${head}.${body}`).sign(sa.key));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${body}.${sig}` }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`token ${r.status} ${j.error || ""}`);
  tok = j.access_token; tokExp = now + (j.expires_in || 3600);
  return tok;
}
// FIRESTORE_DATABASE: only if the database was created with a name other than "(default)".
const dbId = () => (process.env.FIRESTORE_DATABASE || "(default)").trim();
const root = () => `projects/${account().project}/databases/${dbId()}/documents`;
const api = (p) => `https://firestore.googleapis.com/v1/${p}`;
export const docName = (path) => `${root()}/${path}`;

async function call(method, url, body) {
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}
/// Google's own reason (e.g. "Cloud Firestore API has not been used in project … or it is disabled").
export class StoreError extends Error {
  constructor(op, status, j) {
    const e = (Array.isArray(j) ? j[0] : j) || {};
    const g = e.error || {};
    super(`${op} ${status} ${g.status || ""} ${g.message || ""}`.trim());
    this.status = status; this.gStatus = g.status || ""; this.gMessage = g.message || "";
  }
}
function hintFor(err) {
  const m = `${err.gStatus} ${err.gMessage}`.toLowerCase();
  if (/has not been used|is disabled|service_disabled|api.*not.*enabled/.test(m)) return "Enable the Cloud Firestore API for this Google Cloud project (console.cloud.google.com → APIs & Services → Cloud Firestore API → Enable), or create the Firestore database in the Firebase console, which enables it.";
  if (/datastore mode/.test(m)) return "The database is in Datastore mode. Firestore needs a database in Native mode.";
  if (/does not exist|not_found|database.*not found/.test(m)) return "No Firestore database yet: Firebase console → Firestore Database → Create database (Native mode). If you named it, set FIRESTORE_DATABASE to that name.";
  if (/permission|insufficient|iam|caller does not have/.test(m)) return "The service account can't read Firestore. Use the key from Firebase console → Project settings → Service accounts (Firebase Admin SDK), or give this account the Cloud Datastore User role.";
  return null;
}
/// Read-only probe for /api/social?health=1 — never throws.
export async function storeHealth() {
  const sa = account();
  const out = { configured: !!sa, keyError: saErr || null, project: sa ? sa.project : null, database: dbId() };
  if (!sa) return out;
  try { await accessToken(); out.auth = "ok"; } catch (err) { out.auth = String(err.message || err); return out; }
  try { await getDocs(["health/ping"]); out.firestore = "ok"; } catch (err) {
    out.firestore = { status: err.status || null, reason: err.gStatus || null, message: err.gMessage || String(err.message || err) };
    out.hint = hintFor(err);
  }
  return out;
}

// ---- value encoding ----
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: encFields(v) } };
}
export function encFields(o) { const f = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) f[k] = enc(v); return f; }
function dec(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  if ("mapValue" in v) return decFields(v.mapValue.fields || {});
  return null;
}
export function decFields(f) { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = dec(v); return o; }

/// Several documents by path → { path: data | null }.
export async function getDocs(paths) {
  if (!paths.length) return {};
  const { ok, status, j } = await call("POST", api(`${root()}:batchGet`), { documents: paths.map(docName) });
  if (!ok) throw new StoreError("batchGet", status, j);
  const out = Object.fromEntries(paths.map((p) => [p, null]));
  const pre = `${root()}/`;
  for (const r of Array.isArray(j) ? j : []) if (r.found) out[r.found.name.slice(pre.length)] = decFields(r.found.fields);
  return out;
}
/// Replace a document with `data`.
export async function setDoc(path, data) {
  const { ok, status, j } = await call("PATCH", api(docName(path)), { fields: encFields(data) });
  if (!ok) throw new StoreError("set", status, j);
}
/// Atomic batch. writes: [{ create: path, data } | { set: path, data } | { inc: path, fields: {name: n} }]
/// Returns { ok, conflict } — conflict when a `create` target already existed.
export async function commit(writes) {
  const body = {
    writes: writes.map((w) => {
      if (w.create) return { update: { name: docName(w.create), fields: encFields(w.data) }, currentDocument: { exists: false } };
      if (w.set) return { update: { name: docName(w.set), fields: encFields(w.data) } };
      if (w.inc) return { transform: { document: docName(w.inc), fieldTransforms: Object.entries(w.fields).map(([fieldPath, n]) => ({ fieldPath, increment: { integerValue: String(n) } })) } };
      throw new Error("bad write");
    }),
  };
  const { ok, status, j } = await call("POST", api(`${root()}:commit`), body);
  if (ok) return { ok: true };
  const st = j.error && j.error.status;
  if (status === 409 || st === "ALREADY_EXISTS" || st === "FAILED_PRECONDITION") return { ok: false, conflict: true };
  throw new StoreError("commit", status, j);
}
