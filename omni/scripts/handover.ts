// After deploy + wire, on each EVM chain: set rate limits, guardian, rewards wallet, then hand the contract
// to the multisig (owner AND LayerZero delegate). Run once per network:
//   npx hardhat run scripts/handover.ts --network arc
//   npx hardhat run scripts/handover.ts --network robinhood
// Rate limits fail closed: a destination with no limit can't receive anything, so this step is required.
import hre from 'hardhat'
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { cleanForHandover } from '../utils/eids'

// Per destination, per rolling 24h. Decided: 10M (1% of supply) to start; the Safe can raise it with setRateLimits.
const LIMIT = hre.ethers.utils.parseEther(process.env.OMNI_DAILY_LIMIT || '10000000')
const DAY = 86_400

async function main() {
    const name = hre.network.name === 'arc' ? 'ArcircleOFTAdapter' : 'ArcircleOFT'
    const d = await hre.deployments.get(name)
    const c = await hre.ethers.getContractAt(name, d.address)
    const owner = process.env['OMNI_OWNER_' + hre.network.name.toUpperCase()] || process.env.OMNI_OWNER!, guardian = process.env.OMNI_GUARDIAN
    // lockbox rewards → burn engine: swept to the Safe (which buys and burns) unless a burn contract is given
    const rewards = process.env.OMNI_REWARDS_RECEIVER || owner
    if (!/^0x[0-9a-fA-F]{40}$/.test(owner || '')) throw new Error('OMNI_OWNER missing')
    // phase 1: Arc ⇄ Robinhood only. Solana gets a limit (and so becomes reachable) only with OMNI_SOLANA=1;
    // until then it has none, and rate limits fail closed, so nothing can be sent there.
    const all = [EndpointId.ARC_V2_MAINNET, EndpointId.ROBINHOOD_V2_MAINNET, ...(process.env.OMNI_SOLANA === '1' ? [EndpointId.SOLANA_V2_MAINNET] : [])]
    const here = (hre.network.config as { eid: number }).eid
    const others = all.filter((e) => e !== here)

    // 0. the signer must still own it — if not, someone else has it: stop and report
    const [signer] = await hre.ethers.getSigners()
    const cur = await c.owner()
    if (cur.toLowerCase() !== signer.address.toLowerCase()) throw new Error(`STOP: owner is ${cur}, not the deployer — do not continue, report this`)

    // 1. clean anything a leaked deployer key could have added before handover
    const fixed = await cleanForHandover(c, others, guardian || '', hre.ethers)
    console.log(fixed.length ? `  removed: ${fixed.join(', ')}` : '  nothing unexpected found')

    // 2. limits, rewards, then owner + delegate to the Safe
    const limits = others.map((dstEid) => ({ dstEid, limit: LIMIT, window: DAY }))
    await (await c.setRateLimits(limits)).wait()
    if (rewards && name === 'ArcircleOFTAdapter') await (await c.setRewardsReceiver(rewards)).wait()
    await (await c.setDelegate(owner)).wait() // LayerZero config rights
    await (await c.transferOwnership(owner)).wait() // everything else
    console.log(`${name} on ${hre.network.name}: cleaned, limits set, owner + delegate = ${owner}. Now run: npx hardhat omni:audit`)
}
main().catch((e) => { console.error(e); process.exit(1) })
