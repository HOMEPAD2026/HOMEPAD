// The Merkle tree the Multisender builds for ArcDrop (same as arc-multisend.js
// and api/_drop.mjs): leaf = keccak(keccak(abi.encode(index, account, amount))),
// pairs hashed sorted, an odd node moves up unchanged.
const { ethers } = require("ethers");
const coder = ethers.AbiCoder.defaultAbiCoder();
const leaf = (i, a, v) => ethers.keccak256(ethers.keccak256(coder.encode(["uint256", "address", "uint256"], [i, a, v])));
const pair = (a, b) => (a.toLowerCase() < b.toLowerCase() ? ethers.keccak256(ethers.concat([a, b])) : ethers.keccak256(ethers.concat([b, a])));
function build(rows) {
  const layers = [rows.map(([a, v], i) => leaf(i, a, v))];
  while (layers[layers.length - 1].length > 1) {
    const cur = layers[layers.length - 1], next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? pair(cur[i], cur[i + 1]) : cur[i]);
    layers.push(next);
  }
  return { root: layers[layers.length - 1][0], proof: (k) => { const p = []; for (let l = 0; l < layers.length - 1; l++) { const s = k ^ 1; if (s < layers[l].length) p.push(layers[l][s]); k >>= 1; } return p; } };
}
module.exports = { build, leaf };
