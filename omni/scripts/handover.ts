// After deploy + wire, on each EVM chain: set rate limits, guardian, rewards wallet, then hand the contract
// to the multisig (owner AND LayerZero delegate). Run once per network:
//   npx hardhat run scripts/handover.ts --network arc
//   npx hardhat run scripts/handover.ts --network robinhood
// Rate limits fail closed: a destination with no limit can't receive anything, so this step is required.
import hre from 'hardhat'
import { EndpointId } from '@layerzerolabs/lz-definitions'

// Per destination, per rolling 24h. NOT DECIDED — 50M (5% of supply) is a starting proposal to review.
const LIMIT = hre.ethers.utils.parseEther(process.env.OMNI_DAILY_LIMIT || '50000000')
const DAY = 86_400

async function main() {
    const name = hre.network.name === 'arc' ? 'ArcircleOFTAdapter' : 'ArcircleOFT'
    const d = await hre.deployments.get(name)
    const c = await hre.ethers.getContractAt(name, d.address)
    const owner = process.env.OMNI_OWNER!, guardian = process.env.OMNI_GUARDIAN, rewards = process.env.OMNI_REWARDS_RECEIVER
    if (!/^0x[0-9a-fA-F]{40}$/.test(owner || '')) throw new Error('OMNI_OWNER missing')
    const all = [EndpointId.ARC_V2_MAINNET, EndpointId.ROBINHOOD_V2_MAINNET, EndpointId.SOLANA_V2_MAINNET]
    const here = (hre.network.config as { eid: number }).eid
    const limits = all.filter((e) => e !== here).map((dstEid) => ({ dstEid, limit: LIMIT, window: DAY }))
    await (await c.setRateLimits(limits)).wait()
    if (guardian) await (await c.setGuardian(guardian)).wait()
    if (rewards && name === 'ArcircleOFTAdapter') await (await c.setRewardsReceiver(rewards)).wait()
    await (await c.setDelegate(owner)).wait() // LayerZero config rights
    await (await c.transferOwnership(owner)).wait() // everything else
    console.log(`${name} on ${hre.network.name}: limits set, owner + delegate = ${owner}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
