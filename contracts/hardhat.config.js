require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26", // must match Uniswap v4-core's exact-pinned pragma
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true, // needed once launch() takes enough string params to hit "stack too deep"
      evmVersion: "cancun", // v4-core uses transient storage (tload/tstore) — needs Cancun or later
    },
  },
  networks: {
    robinhoodTestnet: {
      url: process.env.ROBINHOOD_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630, // Robinhood Chain testnet. Mainnet is 4663 — do not confuse them.
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    // $HOME itself lives on mainnet even while HOMEPAD's own contracts are
    // still testnet-only — this network is for mainnet-only scripts like
    // distribute-rent.js, not for deploying HOMEPAD's launch contracts yet.
    robinhoodMainnet: {
      url: process.env.ROBINHOOD_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      // Prefer a dedicated deployer key (same separation-of-concerns as
      // testnet) — falls back to TREASURY_PRIVATE_KEY only so
      // distribute-rent.js and other treasury-only scripts keep working
      // for anyone who hasn't set a separate deployer key.
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : process.env.TREASURY_PRIVATE_KEY
        ? [process.env.TREASURY_PRIVATE_KEY]
        : [],
    },
    // Circle's Arc — separate chain, separate contracts (HomepadFactoryArc),
    // nothing here touches Robinhood Chain. Chain ID 5042 is MAINNET —
    // Arc's testnet is 5042002, a different, unrelated network; several
    // early third-party docs listed the wrong ID for one or the other, so
    // this is confirmed straight from Circle's own chain_ids.rs source and
    // cross-checked against arc.etherscan.io's own listed contracts (see
    // deploy-homepad-factory-arc.js for the full paper trail). Gas is paid
    // in USDC, but its NATIVE representation is 18 decimals same as ETH —
    // do not confuse that with the 6-decimal ERC-20 USDC interface.
    arcMainnet: {
      url: process.env.ARC_MAINNET_RPC || "https://rpc.mainnet.arc.io",
      chainId: 5042,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  // Source verification — Robinhood Chain's explorer is Blockscout
  // (Etherscan doesn't support it at all, so the apiKey value there is
  // never actually checked, just required to be a non-empty string). Arc
  // is different: arc.etherscan.io is a real Etherscan-family explorer, so
  // ARC_ETHERSCAN_API_KEY needs to be an actual key from https://etherscan.io
  // (their v2 API is unified across chains under one key) — leaving it
  // blank will make verification fail with an auth error, not silently
  // skip. Network names here must match the `networks` block above.
  etherscan: {
    apiKey: {
      robinhoodTestnet: "blockscout",
      robinhoodMainnet: "blockscout",
      arcMainnet: process.env.ARC_ETHERSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "robinhoodTestnet",
        chainId: 46630,
        urls: {
          apiURL: "https://explorer.testnet.chain.robinhood.com/api",
          browserURL: "https://explorer.testnet.chain.robinhood.com",
        },
      },
      {
        network: "robinhoodMainnet",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api",
          browserURL: "https://robinhoodchain.blockscout.com",
        },
      },
      {
        network: "arcMainnet",
        chainId: 5042,
        urls: {
          apiURL: "https://arc.etherscan.io/api",
          browserURL: "https://arc.etherscan.io",
        },
      },
    ],
  },
};
