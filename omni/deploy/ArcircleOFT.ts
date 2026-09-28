// Robinhood Chain (and any later EVM chain): a mint/burn OFT with zero supply of its own.
//   npx hardhat lz:deploy --networks robinhood --tags ArcircleOFT
import assert from 'assert'
import type { DeployFunction } from 'hardhat-deploy/types'
import { endpointV2 } from '../utils/endpoint'

const deploy: DeployFunction = async (hre) => {
    assert(hre.network.name !== 'arc', 'Arc gets the adapter, not an OFT — two supplies would break the 1B cap')
    const { deployer } = await hre.getNamedAccounts()
    const endpoint = await endpointV2(hre)
    // name/symbol mirror the Arc token (name "arcircle", symbol "ARCIRCLE")
    const { address } = await hre.deployments.deploy('ArcircleOFT', {
        from: deployer,
        args: ['arcircle', 'ARCIRCLE', endpoint, deployer],
        log: true,
        skipIfAlreadyDeployed: true,
    })
    console.log(`ArcircleOFT on ${hre.network.name}: ${address} (endpoint ${endpoint})`)
}
deploy.tags = ['ArcircleOFT']
export default deploy
