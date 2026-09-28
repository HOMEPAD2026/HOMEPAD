// ARCIRCLE OMNI pathways: Arc ⇄ Robinhood, Arc ⇄ Solana, Robinhood ⇄ Solana (a full mesh, so a token can
// move between any two chains directly; the supply invariant holds either way).
//
//   npx hardhat lz:oapp:wire --oapp-config layerzero.config.ts
//
// Security stack — REVIEW BEFORE WIRING (see README "Security"):
//   * required DVNs: LayerZero Labs + SECOND_DVN, both must verify every message (2-of-2 required).
//     SECOND_DVN is NOT DECIDED: pick an operator that LayerZero's metadata lists on all three chains.
//   * block confirmations are set explicitly on both sides of every pathway (never left to defaults).
//   * enforced options: gas for the receive on EVM; compute units + rent lamports for the recipient's token
//     account on Solana.
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities'
import { TwoWayConfig, generateConnectionsConfig } from '@layerzerolabs/metadata-tools'
import { OAppEnforcedOption, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'
import { solanaOftStore } from './solana/store'

const SECOND_DVN = process.env.OMNI_SECOND_DVN || 'NOT_DECIDED' // e.g. a DVN name exactly as in LayerZero metadata
const DVNS: [string[], [string[], number] | []] = [['LayerZero Labs', SECOND_DVN], []]

const arc: OmniPointHardhat = { eid: EndpointId.ARC_V2_MAINNET, contractName: 'ArcircleOFTAdapter' }
const robinhood: OmniPointHardhat = { eid: EndpointId.ROBINHOOD_V2_MAINNET, contractName: 'ArcircleOFT' }
const solana: OmniPointHardhat = { eid: EndpointId.SOLANA_V2_MAINNET, address: solanaOftStore() }

const EVM_OPTIONS: OAppEnforcedOption[] = [{ msgType: 1, optionType: ExecutorOptionType.LZ_RECEIVE, gas: 80_000, value: 0 }]
// Solana receive: compute units + lamports so the recipient's associated token account can be created
const SOLANA_OPTIONS: OAppEnforcedOption[] = [{ msgType: 1, optionType: ExecutorOptionType.LZ_RECEIVE, gas: 200_000, value: 2_500_000 }]

// block confirmations [a → b, b → a] — REVIEW: Arc finalizes deterministically; Solana needs ≥ 32.
const CONF = { arc: 5, robinhood: 20, solana: 32 }

const pathways: TwoWayConfig[] = [
    [arc, robinhood, DVNS, [CONF.arc, CONF.robinhood], [EVM_OPTIONS, EVM_OPTIONS]],
    [arc, solana, DVNS, [CONF.arc, CONF.solana], [SOLANA_OPTIONS, EVM_OPTIONS]],
    [robinhood, solana, DVNS, [CONF.robinhood, CONF.solana], [SOLANA_OPTIONS, EVM_OPTIONS]],
]

export default async function () {
    if (SECOND_DVN === 'NOT_DECIDED') throw new Error('Set OMNI_SECOND_DVN: a 1-DVN setup lets one operator forge messages')
    const connections = await generateConnectionsConfig(pathways)
    return { contracts: [{ contract: arc }, { contract: robinhood }, { contract: solana }], connections }
}
