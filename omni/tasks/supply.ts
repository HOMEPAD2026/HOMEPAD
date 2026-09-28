// npx hardhat omni:supply — the one number that must always hold:
//   $ARCIRCLE locked in the Arc adapter == ARCIRCLE supply on Robinhood + ARCIRCLE supply on Solana
// (a transfer that is in flight between chains shows as a temporary gap in the "locked" direction).
import { task } from 'hardhat/config'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const ERC20 = ['function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)']
const dep = (net: string, name: string) => {
    const f = join(__dirname, '..', 'deployments', net, name + '.json')
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
}

task('omni:supply', 'Checks locked-on-Arc == Robinhood + Solana supply').setAction(async (_a, hre) => {
    const { ethers } = hre as any
    const fmt = (v: bigint, d = 18) => Number(ethers.utils.formatUnits(v.toString(), d)).toLocaleString('en-US', { maximumFractionDigits: 6 })
    const adapter = dep('arc', 'ArcircleOFTAdapter'), rh = dep('robinhood', 'ArcircleOFT'), sol = dep('solana-mainnet', 'OFT')
    const arcP = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_ARC || 'https://rpc.mainnet.arc.io')
    const token = new ethers.Contract('0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7', ERC20, arcP)
    const total = BigInt((await token.totalSupply()).toString())
    const locked = adapter ? BigInt((await token.balanceOf(adapter.address)).toString()) : 0n
    let rhSupply = 0n
    if (rh && process.env.RPC_URL_ROBINHOOD) {
        const p = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_ROBINHOOD)
        rhSupply = BigInt((await new ethers.Contract(rh.address, ERC20, p).totalSupply()).toString())
    }
    let solSupply = 0n
    if (sol && sol.mint) {
        const r = await fetch(process.env.RPC_URL_SOLANA || 'https://api.mainnet-beta.solana.com', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenSupply', params: [sol.mint] }),
        })
        const j = await r.json()
        // Solana keeps 6 decimals; scale to 18 to compare with the EVM side
        solSupply = BigInt(j.result.value.amount) * 10n ** 12n
    }
    const remote = rhSupply + solSupply
    console.log(`Global supply (Arc token): ${fmt(total)}`)
    console.log(`Locked in Arc adapter:     ${fmt(locked)}`)
    console.log(`Robinhood supply:          ${fmt(rhSupply)}`)
    console.log(`Solana supply:             ${fmt(solSupply)}`)
    console.log(locked === remote ? 'OK — every remote token is backed 1:1' : locked > remote ? `In flight: ${fmt(locked - remote)} (locked, not yet minted)` : `ALERT: remote supply exceeds locked by ${fmt(remote - locked)} — pause now`)
    if (remote > locked) process.exitCode = 2
})
