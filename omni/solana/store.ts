// The Solana OFT Store address, written by `lz:oft:solana:create` into deployments/solana-mainnet/OFT.json.
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export function solanaOftStore(): string {
    const f = join(__dirname, '..', 'deployments', 'solana-mainnet', 'OFT.json')
    if (!existsSync(f)) throw new Error('No Solana OFT yet — run solana/README.md steps 1–3 first')
    const j = JSON.parse(readFileSync(f, 'utf8'))
    return j.oftStore
}
