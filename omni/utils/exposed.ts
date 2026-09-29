// Addresses whose private keys were exposed. Never deploy, own or configure anything OMNI with them:
// hardhat.config.ts refuses them as PRIVATE_KEY, and omni:check flags them as owner or delegate.
export const EXPOSED = ['0x80e18846cb2ed34bdf1e3a8a8689fd5d4c9e8bc7']
