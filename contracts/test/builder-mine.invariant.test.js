const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// Randomised runs of BuilderMine: mines open, get topped up, roots go up, builders claim, leftovers burn —
// in a random order at random times, with honest and hostile calls mixed in. After every step the money
// has to add up. Seeded, so a failure replays exactly (FUZZ_SEED=<n> FUZZ_RUNS=<n> to explore more).

const coder = ethers.AbiCoder.defaultAbiCoder();
const leaf = (id, a, v) => ethers.keccak256(ethers.keccak256(coder.encode(["uint256", "address", "uint256"], [id, a, v])));
const pair = (a, b) => (a.toLowerCase() < b.toLowerCase() ? ethers.keccak256(ethers.concat([a, b])) : ethers.keccak256(ethers.concat([b, a])));
function tree(id, rows) {
  const layers = [rows.map(([a, v]) => leaf(id, a, v))];
  while (layers[layers.length - 1].length > 1) {
    const cur = layers[layers.length - 1], next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? pair(cur[i], cur[i + 1]) : cur[i]);
    layers.push(next);
  }
  return { root: layers[layers.length - 1][0], proof: (k) => { const p = []; for (let l = 0; l < layers.length - 1; l++) { const s = k ^ 1; if (s < layers[l].length) p.push(layers[l][s]); k >>= 1; } return p; } };
}
const isqrt = (n) => { if (n < 2n) return n; let x = n, y = (x + 1n) / 2n; while (y < x) { x = y; y = (x + n / x) / 2n; } return x; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

describe("BuilderMine v2 — invariants under random play", function () {
  this.timeout(600000);
  const E = (n) => ethers.parseEther(String(n)), DAY = 86400, DEAD = "0x000000000000000000000000000000000000dEaD";
  const SLOT = ethers.id("arcircle-pool"), RATIO = 13908n * 10n ** 12n;
  const RUNS = Number(process.env.FUZZ_RUNS || 4), STEPS = Number(process.env.FUZZ_STEPS || 70), SEED0 = Number(process.env.FUZZ_SEED || 5042);

  for (let run = 0; run < RUNS; run++) {
    it(`run ${run + 1} (seed ${SEED0 + run}): the money always adds up`, async function () {
      const R = rng(SEED0 + run), pick = (a) => a[Math.floor(R() * a.length)], int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
      const signers = await ethers.getSigners();
      const [owner, op, ...rest] = signers;
      const people = rest.slice(0, 6);
      const Tok = await ethers.getContractFactory("MockTaxToken");
      const arc = await Tok.deploy("ARCIRCLE", "ARCIRCLE", 0);
      const coins = [await Tok.deploy("Plain", "PLN", 0), await Tok.deploy("Taxed", "TAX", 300)]; // 3% tax both ways
      const pm = await (await ethers.getContractFactory("MockExtsload")).deploy();
      await pm.set(SLOT, ethers.toBeHex(isqrt(RATIO << 192n), 32));
      const mine = await (await ethers.getContractFactory("BuilderMine")).deploy(arc.target, pm.target, SLOT, true, op.address);
      await mine.setItem(0, E(20_000), 1, 0, 0, true);
      await mine.setItem(1, E(60_000), 2, 0, 0, true);
      await mine.setItem(2, E(20_000), 0, 2, 3600, true);
      for (const p of people) {
        await arc.mint(p.address, E(50_000_000)); await arc.connect(p).approve(mine.target, ethers.MaxUint256);
        for (const c of coins) { await c.mint(p.address, E(10_000_000)); await c.connect(p).approve(mine.target, ethers.MaxUint256); }
      }
      // what the operator would have handed out: per mine, per builder, cumulative (only grows)
      const alloc = [], trees = [];
      const stats = { opened: 0, topups: 0, roots: 0, claims: 0, burns: 0, refused: 0 };
      const now = async () => BigInt(await time.latest());

      async function check() {
        const n = Number(await mine.mineCount()), t = await now();
        const owedBy = new Map();
        for (let id = 0; id < n; id++) {
          const m = await mine.getMine(id);
          expect(m.claimed <= m.rootTotal, "claimed ≤ rootTotal").to.equal(true);
          expect(m.rootTotal <= m.deposited, "rootTotal ≤ deposited").to.equal(true);
          expect(m.claimed + m.burned <= m.deposited, "claimed + burned ≤ deposited").to.equal(true);
          const em = await mine.emittedAt(id, t);
          expect(em <= m.deposited, "emitted ≤ deposited").to.equal(true);
          expect(m.rootTotal <= em, "rootTotal ≤ emitted now").to.equal(true);
          expect(await mine.emittedAt(id, m.end), "all of it by the end").to.equal(m.deposited);
          if (m.closed) expect(m.claimed + m.burned, "closed mines are empty").to.equal(m.deposited);
          const k = m.token.toLowerCase();
          owedBy.set(k, (owedBy.get(k) || 0n) + (m.deposited - m.claimed - m.burned));
        }
        for (const c of coins) {
          const held = await c.balanceOf(mine.target), owed = owedBy.get(c.target.toLowerCase()) || 0n;
          expect(held >= owed, `contract holds what it owes in ${await c.symbol()}`).to.equal(true);
        }
        expect(await mine.arcircleBurned(), "every $ARCIRCLE paid is at 0x…dEaD").to.equal(await arc.balanceOf(DEAD));
        expect(await arc.balanceOf(mine.target), "the contract never keeps $ARCIRCLE").to.equal(0n);
      }
      async function refused(p) { try { await p; } catch { stats.refused++; return true; } return false; }

      async function postRoot(id) {
        const m = await mine.getMine(id), t = await now();
        if (t < m.start || t > m.end + 3n * 86400n || m.unminedBurned) { expect(await refused(mine.connect(op).postRoot(id, ethers.ZeroHash, m.rootTotal))).to.equal(true); return; }
        const cap = await mine.emittedAt(id, t + 1n); // the next block is at least one second later
        const a = alloc[id];
        let room = cap > m.rootTotal ? cap - m.rootTotal : 0n;
        for (const p of people) { if (room === 0n || R() < 0.4) continue; const add = (room * BigInt(int(1, 60))) / 100n; a[p.address] = (a[p.address] || 0n) + add; room -= add; }
        const rows = Object.entries(a).filter(([, v]) => v > 0n);
        if (!rows.length) return;
        const total = rows.reduce((s, [, v]) => s + v, 0n);
        // a greedy operator asking for more than the schedule is refused
        expect(await refused(mine.connect(op).postRoot(id, ethers.ZeroHash, cap + 10n ** 20n)), "over schedule").to.equal(true);
        if (R() < 0.15) expect(await refused(mine.connect(people[0]).postRoot(id, ethers.ZeroHash, total)), "only the operator").to.equal(true);
        const tr = tree(id, rows);
        await mine.connect(op).postRoot(id, tr.root, total);
        trees[id] = { tr, rows }; stats.roots++;
      }
      async function claim(id) {
        const cur = trees[id]; if (!cur) return;
        const k = int(0, cur.rows.length - 1), [who, cum] = cur.rows[k];
        const m = await mine.getMine(id);
        const done = await mine.claimedBy(id, who);
        // an inflated amount never passes the proof
        expect(await refused(mine.claim(id, who, cum + 1n, cur.tr.proof(k))), "inflated claim").to.equal(true);
        if (m.closed || cum <= done) { expect(await refused(mine.claim(id, who, cum, cur.tr.proof(k)))).to.equal(true); return; }
        const tok = await ethers.getContractAt("MockTaxToken", m.token);
        const before = await tok.balanceOf(mine.target);
        await mine.connect(pick(people)).claim(id, who, cum, cur.tr.proof(k)); // anyone may submit
        expect(before - (await tok.balanceOf(mine.target)), "pays exactly what's owed").to.equal(cum - done);
        stats.claims++;
      }

      for (let step = 0; step < STEPS; step++) {
        const n = Number(await mine.mineCount());
        const r = R();
        if (n === 0 || (r < 0.12 && n < 6)) {
          const who = pick(people), coin = pick(coins);
          await mine.connect(who).openMine(coin.target, E(int(1_000, 900_000)), int(3, 9), int(0, 1) ? 0 : int(0, 2 * DAY), "m", "", "");
          alloc.push({}); stats.opened++;
        } else {
          const id = int(0, n - 1), m = await mine.getMine(id), t = await now();
          if (r < 0.22) {
            const late = t + 3600n >= m.end;
            const ok = !(await refused(mine.connect(pick(people)).topUp(id, E(int(1, 200_000)))));
            if (ok) { expect(late, "no top-ups in the last hour").to.equal(false); stats.topups++; }
          } else if (r < 0.30) {
            await refused(mine.connect(pick(people)).join(id, pick(people).address));
          } else if (r < 0.34) {
            await refused(mine.connect(pick(people)).buyItem(int(0, 2), id));
          } else if (r < 0.55) await postRoot(id);
          else if (r < 0.75) await claim(id);
          else if (r < 0.82) {
            const early = t + 1n <= m.end + 3n * 86400n;
            const ok = !(await refused(mine.burnUnmined(id)));
            if (ok) { expect(early).to.equal(false); stats.burns++; }
          } else if (r < 0.86) {
            const early = t + 1n <= m.end + 33n * 86400n;
            const ok = !(await refused(mine.burnUnclaimed(id)));
            if (ok) { expect(early).to.equal(false); stats.burns++; }
          } else {
            await time.increase(pick([60, 3600, 5 * 3600, DAY, 4 * DAY, 20 * DAY]));
          }
        }
        await check();
      }
      // wind everything down: past every window, burn the rest, and each mine ends at exactly zero
      await time.increase(80 * DAY);
      const n = Number(await mine.mineCount());
      for (let id = 0; id < n; id++) { const m = await mine.getMine(id); if (!m.closed) await mine.burnUnclaimed(id); }
      await check();
      for (const c of coins) {
        const left = await c.balanceOf(mine.target);
        expect(left, `nothing of ${await c.symbol()} stays behind`).to.equal(0n);
      }
      expect(stats.opened).to.be.greaterThan(0);
      console.log(`      ${JSON.stringify(stats)}`);
    });
  }
});
