// Where LayerZero's EndpointV2 lives on the network being deployed to.
// 1) the devtools' bundled deployments (hre.deployments.get('EndpointV2')), else
// 2) LayerZero's public metadata (https://metadata.layerzero-api.com/v1/metadata/deployments), matched by eid.
// Never hard-code: a wrong endpoint would make the OApp unusable.
import type { HardhatRuntimeEnvironment } from 'hardhat/types'

export async function endpointV2(hre: HardhatRuntimeEnvironment): Promise<string> {
    try {
        return (await hre.deployments.get('EndpointV2')).address
    } catch {
        /* not bundled for this chain yet */
    }
    const eid = String((hre.network.config as { eid?: number }).eid || '')
    const res = await fetch('https://metadata.layerzero-api.com/v1/metadata/deployments')
    const meta = (await res.json()) as Record<string, { deployments?: { eid: string; version: number; endpointV2?: { address: string } }[] }>
    for (const chain of Object.values(meta)) {
        const d = (chain.deployments || []).find((x) => x.eid === eid && x.version === 2 && x.endpointV2)
        if (d && d.endpointV2) return d.endpointV2.address
    }
    throw new Error(`No LayerZero EndpointV2 found for eid ${eid}`)
}
