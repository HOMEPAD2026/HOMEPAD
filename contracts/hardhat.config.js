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
  },
  // Source verification — both networks' official explorer is Blockscout
  // (Etherscan doesn't support Robinhood Chain at all), which doesn't
  // check the apiKey value, just requires the field to be a non-empty
  // string. Network names here must match the `networks` block above.
  etherscan: {
    apiKey: {
      robinhoodTestnet: "blockscout",
      robinhoodMainnet: "blockscout",
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
    ],
  },
};
