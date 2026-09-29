// ARCIRCLE OMNI — Hardhat + LayerZero devtools. Keys come from .env only (see .env.example).
import 'dotenv/config'
import 'hardhat-deploy'
import '@nomiclabs/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'
import '@layerzerolabs/toolbox-hardhat'
import { EndpointId } from '@layerzerolabs/lz-definitions'
import type { HardhatUserConfig, HttpNetworkAccountsUserConfig } from 'hardhat/types'
import './tasks/supply'
import './tasks/check'

import { Wallet } from 'ethers'
import { EXPOSED } from './utils/exposed'

// Refuse known-exposed keys before anything signs: whoever else holds them could take over what they deploy.
if (process.env.PRIVATE_KEY) {
    let who = ''
    try { who = new Wallet(process.env.PRIVATE_KEY).address.toLowerCase() } catch { throw new Error('PRIVATE_KEY in .env is not a valid key') }
    if (EXPOSED.includes(who)) throw new Error(`PRIVATE_KEY belongs to ${who.slice(0, 6)}…${who.slice(-4)}, a key that was exposed. Make a NEW wallet for deploying (ROBINHOOD.md step 1).`)
}
const accounts: HttpNetworkAccountsUserConfig | undefined = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : undefined

const config: HardhatUserConfig = {
    solidity: {
        // same compiler + EVM target as the ArcPad contracts already live on Arc
        compilers: [{ version: '0.8.26', settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' } }],
    },
    networks: {
        arc: {
            eid: EndpointId.ARC_V2_MAINNET, // 30417 · chain id 5042
            url: process.env.RPC_URL_ARC || 'https://rpc.mainnet.arc.io',
            accounts,
        },
        robinhood: {
            eid: EndpointId.ROBINHOOD_V2_MAINNET, // 30416 · chain id 4663
            url: process.env.RPC_URL_ROBINHOOD || 'https://rpc.mainnet.chain.robinhood.com',
            accounts,
        },
        hardhat: { allowUnlimitedContractSize: true },
    },
    namedAccounts: { deployer: { default: 0 } },
}

export default config
