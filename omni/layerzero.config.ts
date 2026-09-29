// ARCIRCLE OMNI pathways. Phase 1 (now): Arc ⇄ Robinhood Chain only. Solana joins later with OMNI_SOLANA=1
// (after solana/README.md) and then becomes a full mesh (Arc ⇄ Solana, Robinhood ⇄ Solana).
//
//   npx hardhat lz:oapp:wire --oapp-config layerzero.config.ts
//
// Security stack — REVIEW BEFORE WIRING (README "Security"):
//   * 2 required DVNs on every pathway: LayerZero Labs + OMNI_SECOND_DVN (both must verify every message).
//   * DVN, library and executor ADDRESSES are pinned per chain below — not looked up by name — because on Arc the
//     name "LayerZero Labs" matches two entries and the older one (0x282b…46b4) is DEPRECATED. A name lookup could
//     pick it. Addresses from LayerZero's metadata API (read 30 Sep 2026); `npx hardhat omni:check` confirms each one
//     has code on its chain, and the README says where to compare them by eye before wiring.
//   * block confirmations are set on both sides of each pathway (never left to defaults).
//   * enforced options: gas for the receive on EVM; compute units + rent lamports on Solana.
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities'
import { OAppEnforcedOption, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'

// ---- pinned LayerZero V2 addresses (verify before wiring) ----
export const LZ = {
    arc: {
        eid: EndpointId.ARC_V2_MAINNET, // 30417 · chain 5042
        endpoint: '0x6F475642a6e85809B1c36Fa62763669b1b48DD5B',
        sendLib: '0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7', // SendUln302
        receiveLib: '0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043', // ReceiveUln302
        executor: '0x4208D6E27538189bB48E603D6123A94b8Abe0A0b',
        dvns: {
            'LayerZero Labs': '0xa2447e5b58d357c49bf74b50b14421e6a100e525', // NOT 0x282b…46b4 (deprecated)
            Nethermind: '0x9e0e95ede70f680f74480b510ff9f45c70e3da80',
            Horizen: '0xd36246c322ee102a2203bca9cafb84c179d306f6',
            Canary: '0xacde1f22eeab249d3ca6ba8805c8fee9f52a16e7',
            P2P: '0x69df29c29afcc8d1a0ee563a27827427f89ef698',
            Nansen: '0x5ac51ee1a545ebd55a91bb3223c5cffc4fde51c0',
        } as Record<string, string>,
    },
    robinhood: {
        eid: EndpointId.ROBINHOOD_V2_MAINNET, // 30416 · chain 4663
        endpoint: '0x6F475642a6e85809B1c36Fa62763669b1b48DD5B',
        sendLib: '0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7',
        receiveLib: '0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043',
        executor: '0x4208D6E27538189bB48E603D6123A94b8Abe0A0b',
        dvns: {
            'LayerZero Labs': '0xd01ae6905d48315f7be10c7330aecf8360ef5b12',
            Nethermind: '0x0ffe02df012299a370d5dd69298a5826eacafdf8',
            Horizen: '0x1258a278519c7f4bd997a9c3bfd4aa802a028d89',
            Canary: '0x8d77d35604a9f37f488e41d1d916b2a0088f82dd',
            P2P: '0x8ed0a851964604bb1b6b1a703f4c8234ee684d76',
            Nansen: '0x965718b834b58a0a47a1723c1a28c2f1a7f1f7a0',
        } as Record<string, string>,
    },
}
// operators listed (not deprecated) on BOTH Arc and Robinhood — the second DVN must be one of these
export const SECOND_DVN_CHOICES = ['Nethermind', 'Horizen', 'Canary', 'P2P', 'Nansen']
export const SECOND_DVN = process.env.OMNI_SECOND_DVN || 'NOT_DECIDED'

// block confirmations each chain waits before its DVNs verify — REVIEW (Arc finalizes deterministically)
export const CONF = { arc: 5, robinhood: 20, solana: 32 }

const EVM_OPTIONS: OAppEnforcedOption[] = [{ msgType: 1, optionType: ExecutorOptionType.LZ_RECEIVE, gas: 80_000, value: 0 }]
const SOLANA_OPTIONS: OAppEnforcedOption[] = [{ msgType: 1, optionType: ExecutorOptionType.LZ_RECEIVE, gas: 200_000, value: 2_500_000 }]

const arc: OmniPointHardhat = { eid: LZ.arc.eid, contractName: 'ArcircleOFTAdapter' }
const robinhood: OmniPointHardhat = { eid: LZ.robinhood.eid, contractName: 'ArcircleOFT' }

// the two required DVNs on one chain, sorted ascending (the ULN rejects unsorted or duplicate lists)
export function dvnsOn(chain: 'arc' | 'robinhood'): string[] {
    const m = LZ[chain].dvns
    const a = m['LayerZero Labs'], b = m[SECOND_DVN]
    if (!b) throw new Error(`OMNI_SECOND_DVN must be one of ${SECOND_DVN_CHOICES.join(', ')} (got "${SECOND_DVN}")`)
    return [a, b].map((x) => x.toLowerCase()).sort()
}

// one direction's edge: `from` sends to `to` and receives from it; every address is `from`'s own chain's
function edge(from: 'arc' | 'robinhood', to: 'arc' | 'robinhood') {
    const L = LZ[from]
    const uln = (confirmations: number) => ({ confirmations: BigInt(confirmations), requiredDVNs: dvnsOn(from), optionalDVNs: [], optionalDVNThreshold: 0 })
    return {
        from: from === 'arc' ? arc : robinhood,
        to: to === 'arc' ? arc : robinhood,
        config: {
            sendLibrary: L.sendLib,
            receiveLibraryConfig: { receiveLibrary: L.receiveLib, gracePeriod: BigInt(0) },
            sendConfig: { executorConfig: { maxMessageSize: 10_000, executor: L.executor }, ulnConfig: uln(CONF[from]) },
            receiveConfig: { ulnConfig: uln(CONF[to]) }, // the sender's confirmations
            enforcedOptions: EVM_OPTIONS,
        },
    }
}

export default async function () {
    if (SECOND_DVN === 'NOT_DECIDED') throw new Error('Set OMNI_SECOND_DVN (one of ' + SECOND_DVN_CHOICES.join(', ') + '): a 1-DVN setup lets one operator forge messages')
    const contracts: { contract: OmniPointHardhat }[] = [{ contract: arc }, { contract: robinhood }]
    const connections: unknown[] = [edge('arc', 'robinhood'), edge('robinhood', 'arc')]
    // phase 2: Solana — needs its own pinned addresses and the Solana OFT store (solana/README.md)
    if (process.env.OMNI_SOLANA === '1') {
        const { solanaOftStore } = await import('./solana/store')
        const { generateConnectionsConfig } = await import('@layerzerolabs/metadata-tools')
        const solana: OmniPointHardhat = { eid: EndpointId.SOLANA_V2_MAINNET, address: solanaOftStore() }
        contracts.push({ contract: solana })
        const DVNS: [string[], [string[], number] | []] = [['LayerZero Labs', SECOND_DVN], []]
        connections.push(...(await generateConnectionsConfig([
            [arc, solana, DVNS, [CONF.arc, CONF.solana], [SOLANA_OPTIONS, EVM_OPTIONS]],
            [robinhood, solana, DVNS, [CONF.robinhood, CONF.solana], [SOLANA_OPTIONS, EVM_OPTIONS]],
        ])))
    }
    return { contracts, connections }
}
