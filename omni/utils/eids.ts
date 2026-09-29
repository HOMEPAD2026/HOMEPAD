// Every LayerZero V2 mainnet endpoint id known to lz-definitions — used to prove no unexpected peer exists.
import { EndpointId } from '@layerzerolabs/lz-definitions'

export const V2_MAINNET_EIDS: number[] = [...new Set(
    Object.entries(EndpointId)
        .filter(([k, v]) => typeof v === 'number' && /_V2_MAINNET$/.test(k))
        .map(([, v]) => v as number)
)].sort((a, b) => a - b)

// read peers(eid) for every eid, a few at a time; returns only the non-zero ones
export async function nonZeroPeers(oapp: any, eids = V2_MAINNET_EIDS, batch = 20) {
    const out: { eid: number; peer: string }[] = []
    for (let i = 0; i < eids.length; i += batch) {
        const part = eids.slice(i, i + batch)
        const got = await Promise.all(part.map((e) => oapp.peers(e)))
        got.forEach((p, j) => { if (!/^0x0*$/.test(p)) out.push({ eid: part[j], peer: p }) })
    }
    return out
}

// Before handover: undo anything the deploying key could have added beyond the intended setup —
// peers on other chains, a message inspector, a pre-crime hook, a guardian that isn't ours. Returns what it fixed.
export async function cleanForHandover(c: any, keepEids: number[], guardian: string, ethers: any): Promise<string[]> {
    const ZERO = ethers.constants.AddressZero, fixed: string[] = []
    for (const { eid, peer } of await nonZeroPeers(c)) {
        if (keepEids.includes(eid)) continue
        await (await c.setPeer(eid, ethers.constants.HashZero)).wait()
        fixed.push(`peer ${eid} (${peer})`)
    }
    if ((await c.msgInspector()) !== ZERO) { await (await c.setMsgInspector(ZERO)).wait(); fixed.push('msgInspector') }
    if ((await c.preCrime()) !== ZERO) { await (await c.setPreCrime(ZERO)).wait(); fixed.push('preCrime') }
    const want = guardian || ZERO
    if ((await c.guardian()).toLowerCase() !== want.toLowerCase()) { await (await c.setGuardian(want)).wait(); fixed.push('guardian') }
    return fixed
}
