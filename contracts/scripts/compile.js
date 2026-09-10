// Compiles every .sol file under contracts/ using solc-js directly.
// This exists because this sandbox's network policy blocks
// binaries.soliditylang.org, which Hardhat's built-in compiler manager
// needs to fetch the native solc binary. solc-js (the WASM build shipped
// as the npm "solc" package) works fully offline.
//
// It writes artifacts in the same JSON shape Hardhat expects, so
// `npx hardhat test --no-compile` can still use hardhat-ethers normally.
// If you have normal internet access in your own environment, you likely
// don't need this file at all — `npx hardhat compile` will just work.

const fs = require("fs");
const path = require("path");
const solc = require("solc");

const CONTRACTS_DIR = path.join(__dirname, "..", "contracts");
const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts", "contracts");
const NODE_MODULES = path.join(__dirname, "..", "node_modules");

function findSolFiles(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(findSolFiles(p));
    else if (entry.name.endsWith(".sol")) out.push(p);
  }
  return out;
}

function importCallback(importPath) {
  // Resolve @openzeppelin/... and relative imports against node_modules / contracts.
  const candidates = [
    path.join(NODE_MODULES, importPath),
    path.join(CONTRACTS_DIR, importPath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return { contents: fs.readFileSync(c, "utf8") };
    }
  }
  return { error: `File not found: ${importPath}` };
}

const solFiles = findSolFiles(CONTRACTS_DIR);
const sources = {};
for (const f of solFiles) {
  const rel = "contracts/" + path.relative(CONTRACTS_DIR, f).replace(/\\/g, "/");
  sources[rel] = { content: fs.readFileSync(f, "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "cancun", // v4-core uses transient storage (tload/tstore) — needs Cancun or later
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

console.log(`Compiling ${solFiles.length} files with solc ${solc.version()}...`);
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: importCallback }));

let hasError = false;
if (output.errors) {
  for (const err of output.errors) {
    console.log(err.severity === "error" ? "ERROR: " : "warning: ", err.formattedMessage || err.message);
    if (err.severity === "error") hasError = true;
  }
}
if (hasError) {
  process.exit(1);
}

for (const [sourceName, contracts] of Object.entries(output.contracts || {})) {
  for (const [contractName, artifact] of Object.entries(contracts)) {
    const outDir = path.join(ARTIFACTS_DIR, ...sourceName.replace(/^contracts\//, "").split("/").slice(0, -1), path.basename(sourceName));
    fs.mkdirSync(outDir, { recursive: true });
    const hardhatArtifact = {
      _format: "hh-sol-artifact-1",
      contractName,
      sourceName,
      abi: artifact.abi,
      bytecode: "0x" + artifact.evm.bytecode.object,
      deployedBytecode: "0x" + artifact.evm.deployedBytecode.object,
      linkReferences: {},
      deployedLinkReferences: {},
    };
    fs.writeFileSync(path.join(outDir, `${contractName}.json`), JSON.stringify(hardhatArtifact, null, 2));
  }
}

console.log("Done. Artifacts written to artifacts/contracts/");
