// npx hardhat omni:check — before and after wiring Arc ⇄ Robinhood:
//   1. every pinned LayerZero address in layerzero.config.ts (endpoint, libraries, executor, both DVNs) has code on
//      its chain — a typo or a wrong-chain address shows up here, not in a stuck transfer;
//   2. once deployed and wired: each side's peer is the other contract, and the live send/receive config on the
//      endpoint is exactly the pinned one (the 2 DVNs, confirmations, executor). Anything else prints MISMATCH.
// Read-only: it signs nothing.
import { task } from 'hardhat/config'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const dep = (net: string, name: string) => {
    const f = join(__dirname, '..', 'deployments', net, name + '.json')
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
}
const ENDPOINT_ABI = ['function getConfig(address,address,uint32,uint32) view returns (bytes)', 'function getSendLibrary(address,uint32) view returns (address)',
    'function getReceiveLibrary(address,uint32) view returns (address,bool)']
const OAPP_ABI = ['function peers(uint32) view returns (bytes32)', 'function owner() view returns (address)', 'function token() view returns (address)',
    'function rewardsReceiver() view returns (address)']
const SAFE_ABI = ['function getThreshold() view returns (uint256)', 'function getOwners() view returns (address[])']
const ULN = 'tuple(uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs)'

task('omni:check', 'Checks the pinned LayerZero addresses and, after wiring, the live Arc ⇄ Robinhood config').setAction(async (_a, hre) => {
    const { ethers } = hre as any
    const cfg = await import('../layerzero.config')
    const { LZ, CONF } = cfg
    let bad = 0
    const ok = (c: boolean, msg: string) => { console.log((c ? '  ok        ' : '  MISMATCH  ') + msg); if (!c) bad++ }
    const rpc = { arc: process.env.RPC_URL_ARC || 'https://rpc.mainnet.arc.io', robinhood: process.env.RPC_URL_ROBINHOOD || 'https://rpc.mainnet.chain.robinhood.com' }
    const names = { arc: 'ArcircleOFTAdapter', robinhood: 'ArcircleOFT' }
    const deployed: Record<string, string | null> = { arc: dep('arc', names.arc)?.address || null, robinhood: dep('robinhood', names.robinhood)?.address || null }
    for (const chain of ['arc', 'robinhood'] as const) {
        console.log(`\n== ${chain} (eid ${LZ[chain].eid})`)
        if (!rpc[chain]) { console.log('  skipped: set RPC_URL_ROBINHOOD in .env'); bad++; continue }
        const p = new ethers.providers.JsonRpcProvider(rpc[chain])
        const L = LZ[chain]
        let dvns: string[] = []
        try { dvns = cfg.dvnsOn(chain) } catch (e) { console.log('  ' + (e as Error).message); bad++ }
        for (const [k, a] of Object.entries({ endpoint: L.endpoint, sendLib: L.sendLib, receiveLib: L.receiveLib, executor: L.executor, ...Object.fromEntries(dvns.map((d, i) => ['dvn' + (i + 1), d])) })) {
            const code = await p.getCode(a)
            ok(code && code !== '0x', `${k} ${a} has code`)
        }
        // the owner Safe (decided: 2-of-3, same address on both chains) must exist here before handover
        const safe = process.env['OMNI_OWNER_' + chain.toUpperCase()] || process.env.OMNI_OWNER
        if (safe && /^0x[0-9a-fA-F]{40}$/.test(safe)) {
            const hasCode = (await p.getCode(safe)) !== '0x'
            ok(hasCode, `owner Safe ${safe} exists on ${chain}`)
            if (hasCode) {
                const sc = new ethers.Contract(safe, SAFE_ABI, p)
                const [t, o] = await Promise.all([sc.getThreshold(), sc.getOwners()])
                ok(Number(t) >= 2, `Safe threshold ${t}-of-${o.length} (want at least 2 signers)`)
            }
        } else console.log('  (OMNI_OWNER not set — create the Safe and put it in .env)')
        const me = deployed[chain], other = chain === 'arc' ? 'robinhood' : 'arc'
        if (!me) { console.log(`  (${names[chain]} not deployed yet — deploy + wire, then run this again)`); continue }
        const oapp = new ethers.Contract(me, OAPP_ABI, p), ep = new ethers.Contract(L.endpoint, ENDPOINT_ABI, p)
        const peer = await oapp.peers(LZ[other].eid)
        const want = deployed[other] ? ethers.utils.hexZeroPad(deployed[other]!, 32).toLowerCase() : null
        ok(want !== null && peer.toLowerCase() === want, `peer for ${other} = ${peer}`)
        if (chain === 'arc') ok((await oapp.token()).toLowerCase() === '0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7', 'adapter token is $ARCIRCLE')
        const sendLib = await ep.getSendLibrary(me, LZ[other].eid)
        ok(sendLib.toLowerCase() === L.sendLib.toLowerCase(), `send library ${sendLib}`)
        const [recvLib] = await ep.getReceiveLibrary(me, LZ[other].eid)
        ok(recvLib.toLowerCase() === L.receiveLib.toLowerCase(), `receive library ${recvLib}`)
        const decode = (hex: string) => ethers.utils.defaultAbiCoder.decode([ULN], hex)[0]
        const s = decode(await ep.getConfig(me, L.sendLib, LZ[other].eid, 2))
        const r = decode(await ep.getConfig(me, L.receiveLib, LZ[other].eid, 2))
        const same = (x: string[]) => JSON.stringify(x.map((a) => a.toLowerCase()).sort()) === JSON.stringify(dvns)
        ok(same(s.requiredDVNs) && s.optionalDVNs.length === 0, `send DVNs ${s.requiredDVNs.join(', ')}`)
        ok(Number(s.confirmations) === CONF[chain], `send confirmations ${s.confirmations} (want ${CONF[chain]})`)
        ok(same(r.requiredDVNs) && r.optionalDVNs.length === 0, `receive DVNs ${r.requiredDVNs.join(', ')}`)
        ok(Number(r.confirmations) === CONF[other], `receive confirmations ${r.confirmations} (want ${CONF[other]})`)
        const ex = ethers.utils.defaultAbiCoder.decode(['tuple(uint32 maxMessageSize,address executor)'], await ep.getConfig(me, L.sendLib, LZ[other].eid, 1))[0]
        ok(ex.executor.toLowerCase() === L.executor.toLowerCase(), `executor ${ex.executor}`)
        const owner = await oapp.owner()
        if (safe) ok(owner.toLowerCase() === safe.toLowerCase(), `owner ${owner} is the Safe (after handover)`)
        else console.log(`  owner: ${owner} (after handover this must be the Safe)`)
        if (chain === 'arc') console.log(`  rewards receiver: ${await oapp.rewardsReceiver()} (lockbox rewards → buy and burn $ARCIRCLE)`)
    }
    console.log(bad ? `\n${bad} problem(s) — do not bridge until they're fixed.` : '\nAll checks passed.')
    if (bad) process.exitCode = 1
})
