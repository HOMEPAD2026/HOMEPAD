// tools/build-whitepaper-pdf.mjs — renders /whitepaper and /whitepaper/ko to
// the downloadable A4 PDFs in /pdf (the "Download PDF" buttons link there).
// Re-run after editing whitepaper.html or whitepaper-ko.html.
//
//   npx serve -l 8797 .            (or any static server with the vercel.json rewrites)
//   npm i -D playwright && npx playwright install chromium
//   node tools/build-whitepaper-pdf.mjs [http://localhost:8797]
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] || "http://localhost:8797";
const JOBS = [["/whitepaper", "ARCIRCLE-PAD-Whitepaper-EN.pdf"], ["/whitepaper/ko", "ARCIRCLE-PAD-Whitepaper-KO.pdf"]];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const [url, file] of JOBS) {
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.pdf({ path: path.join(ROOT, "pdf", file), printBackground: true, preferCSSPageSize: true });
  console.log("pdf/" + file);
}
await browser.close();
