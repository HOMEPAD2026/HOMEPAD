// npx hardhat omni:audit — after handover: proves the deployed OMNI contracts carry nothing but the intended
// setup, so a key that deployed them (even a leaked one) holds no power any more. Read-only; signs nothing.
//
// Per chain it checks: owner and LayerZero delegate are the Safe; the ONLY peer across every LayerZero V2
// mainnet endpoint is the other OMNI contract (a message is accepted only from a peer, so this is the gate);
// no receive-library grace window that could let an old library deliver; no message inspector or pre-crime
// hook; guardian as configured; daily limit and window as configured; and on Arc the rewards receiver.
import { task } from 'hardhat/config'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const dep = (net: string, name: string) => {
    const f = join(__dirname, '..', 'deployments', net, name + '.json')
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
}
const OAPP_ABI = ['function peers(uint32) view returns (bytes32)', 'function owner() view returns (address)', 'function guardian() view returns (address)',
    'function msgInspector() view returns (address)', 'function preCrime() view returns (address)', 'function paused() view returns (bool)',
    'function rateLimits(uint32) view returns (uint256 amountInFlight, uint256 lastUpdated, uint256 limit, uint256 window)',
    'function rewardsReceiver() view returns (address)']
const ENDPOINT_ABI = ['function delegates(address) view returns (address)', 'function receiveLibraryTimeout(address,uint32) view returns (address lib, uint256 expiry)']

task('omni:audit', 'After handover: proves only the intended OMNI setup exists (peers across all LayerZero chains, owner, delegate, hooks, limits)').setAction(async (_a, hre) => {
    const { ethers } = hre as any
    const { LZ } = await import('../layerzero.config')
    const { V2_MAINNET_EIDS, nonZeroPeers } = await import('../utils/eids')
    const { EXPOSED } = await import('../utils/exposed')
    let bad = 0
    const ok = (c: boolean, msg: string) => { console.log((c ? '  ok        ' : '  ALERT     ') + msg); if (!c) bad++ }
    const rpc = { arc: process.env.RPC_URL_ARC || 'https://rpc.mainnet.arc.io', robinhood: process.env.RPC_URL_ROBINHOOD || 'https://rpc.mainnet.chain.robinhood.com' }
    const names = { arc: 'ArcircleOFTAdapter', robinhood: 'ArcircleOFT' }
    const addr = { arc: dep('arc', names.arc)?.address as string | undefined, robinhood: dep('robinhood', names.robinhood)?.address as string | undefined }
    const LIMIT = ethers.utils.parseEther(process.env.OMNI_DAILY_LIMIT || '10000000')
    const ZERO = ethers.constants.AddressZero
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
    console.log(`checking peers on ${V2_MAINNET_EIDS.length} LayerZero V2 mainnet endpoints per chain`)

    for (const chain of ['arc', 'robinhood'] as const) {
        const other = chain === 'arc' ? 'robinhood' : 'arc'
        console.log(`\n== ${chain}`)
        const me = addr[chain]
        if (!me || !addr[other]) { ok(false, `${names[chain]} / ${names[other]} not found in deployments/`); continue }
        const safe = process.env['OMNI_OWNER_' + chain.toUpperCase()] || process.env.OMNI_OWNER || ''
        const p = new ethers.providers.JsonRpcProvider(rpc[chain])
        const c = new ethers.Contract(me, OAPP_ABI, p), ep = new ethers.Contract(LZ[chain].endpoint, ENDPOINT_ABI, p)
        const otherEid = LZ[other].eid

        const owner = await c.owner()
        const delegate: string = await ep.delegates(me).catch(() => 'unreadable')
        ok(!!safe && same(owner, safe), `owner ${owner} is the Safe`)
        ok(!!safe && same(delegate, safe), `LayerZero delegate ${delegate} is the Safe`)
        ok(!EXPOSED.includes(owner.toLowerCase()) && !EXPOSED.includes(delegate.toLowerCase()), 'no exposed key as owner or delegate')

        const peers = await nonZeroPeers(c)
        const want = ethers.utils.hexZeroPad(addr[other], 32).toLowerCase()
        const extra = peers.filter((x) => x.eid !== otherEid)
        ok(extra.length === 0, extra.length ? `unexpected peers: ${extra.map((x) => `${x.eid}→${x.peer}`).join(', ')}` : 'no peer on any other chain')
        const mine = peers.find((x) => x.eid === otherEid)
        ok(!!mine && mine.peer.toLowerCase() === want, `peer for ${other} = ${mine ? mine.peer : 'none'}`)

        const t = await ep.receiveLibraryTimeout(me, otherEid).catch(() => null)
        ok(!!t && t.expiry.isZero(), !t ? 'receive-library timeout unreadable' : t.expiry.isZero() ? 'no receive-library grace window' : `receive-library grace window: ${t.lib} until block ${t.expiry}`)
        ok(same(await c.msgInspector(), ZERO), 'no message inspector')
        ok(same(await c.preCrime(), ZERO), 'no pre-crime hook')
        const g = await c.guardian(), wantG = process.env.OMNI_GUARDIAN || ZERO
        ok(same(g, wantG), `guardian ${g}${same(wantG, ZERO) ? ' (none set)' : ''}`)
        const rl = await c.rateLimits(otherEid)
        ok(rl.limit.eq(LIMIT) && rl.window.eq(86_400), `daily limit to ${other}: ${ethers.utils.formatEther(rl.limit)} per ${rl.window}s`)
        if (chain === 'arc') {
            const r = await c.rewardsReceiver(), wantR = process.env.OMNI_REWARDS_RECEIVER || safe
            ok(!!wantR && same(r, wantR), `rewards receiver ${r} (lockbox rewards → burn engine)`)
        }
        console.log(`  paused: ${await c.paused()}`)
    }
    console.log(bad ? `\n${bad} alert(s) — do not bridge. Send this output before doing anything else.` : '\nAudit clean: only the intended setup exists, and only the Safe can change it.')
    if (bad) process.exitCode = 1
})
