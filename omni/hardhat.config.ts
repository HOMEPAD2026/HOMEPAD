// ARCIRCLE OMNI — Hardhat + LayerZero devtools. Keys come from .env only (see .env.example).
import 'dotenv/config'
import 'hardhat-deploy'
import '@nomicfoundation/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'
import '@layerzerolabs/toolbox-hardhat'
import { EndpointId } from '@layerzerolabs/lz-definitions'
import type { HardhatUserConfig, HttpNetworkAccountsUserConfig } from 'hardhat/types'
import './tasks/supply'

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
            url: process.env.RPC_URL_ROBINHOOD || '',
            accounts,
        },
        hardhat: { allowUnlimitedContractSize: true },
    },
    namedAccounts: { deployer: { default: 0 } },
}

export default config
