// Arc only: the lockbox for the existing $ARCIRCLE token. Exactly one of these may ever exist.
//   npx hardhat lz:deploy --networks arc --tags ArcircleOFTAdapter
import assert from 'assert'
import type { DeployFunction } from 'hardhat-deploy/types'
import { endpointV2 } from '../utils/endpoint'

export const ARCIRCLE = '0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7' // $ARCIRCLE on Arc (chain 5042) — do not change

const deploy: DeployFunction = async (hre) => {
    assert(hre.network.name === 'arc', 'The adapter only goes on Arc')
    const { deployer } = await hre.getNamedAccounts()
    const owner = process.env.OMNI_OWNER
    assert(owner && /^0x[0-9a-fA-F]{40}$/.test(owner), 'Set OMNI_OWNER (the multisig) in .env')
    const endpoint = await endpointV2(hre)
    // The deployer is the temporary delegate/owner so `wire` can configure it; ownership moves to
    // OMNI_OWNER in scripts/handover (README step 6) — keep that step, never leave a hot key in charge.
    const { address } = await hre.deployments.deploy('ArcircleOFTAdapter', {
        from: deployer,
        args: [ARCIRCLE, endpoint, deployer],
        log: true,
        skipIfAlreadyDeployed: true,
    })
    console.log(`ArcircleOFTAdapter on arc: ${address} (endpoint ${endpoint}, token ${ARCIRCLE})`)
}
deploy.tags = ['ArcircleOFTAdapter']
export default deploy
