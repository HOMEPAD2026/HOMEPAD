import fs from "node:fs";
const [prompt, ratio, out, ...refs] = process.argv.slice(2);
const K = process.env.MESHY_API_KEY, B = "https://api.meshy.ai/openapi/v1/image-to-image";
const H = { Authorization: "Bearer " + K, "Content-Type": "application/json" };
const ref = (p) => "data:image/png;base64," + fs.readFileSync(p).toString("base64");
const r = await fetch(B, { method: "POST", headers: H, body: JSON.stringify({ ai_model: "nano-banana", prompt, aspect_ratio: ratio, reference_image_urls: refs.map(ref) }) });
const j = await r.json(); if (!r.ok) { console.error(r.status, JSON.stringify(j)); process.exit(1); }
const id = j.result; console.log("task", id);
for (;;) { await new Promise((k) => setTimeout(k, 5000)); const t = await (await fetch(B + "/" + id, { headers: H })).json();
  if (t.status === "SUCCEEDED") { const u = t.image_urls[0]; fs.writeFileSync(out, Buffer.from(await (await fetch(u)).arrayBuffer())); console.log(out, "ok"); break; }
  if (["FAILED", "CANCELED", "EXPIRED"].includes(t.status)) { console.error(t.status, JSON.stringify(t.task_error)); process.exit(1); } }
