// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {HookMiner} from "v4-periphery/test/shared/HookMiner.sol";
import {OnTopHook} from "../src/OnTopHook.sol";
import {OnTopRouter} from "../src/OnTopRouter.sol";
import {OnTopDistributor} from "../src/OnTopDistributor.sol";
import {OnTopLaunchpad} from "../src/OnTopLaunchpad.sol";

/// @notice forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast
/// Env: PRIVATE_KEY, NETWORK (testnet|mainnet). Writes deployments/<NETWORK>.json; run via script/deploy.sh,
/// which adds the L2 start block (on Arbitrum chains block.number is the L1 block).
contract Deploy is Script {
    // Uniswap v4 PoolManager — same address on Robinhood Chain mainnet (4663) and testnet (46630)
    IPoolManager constant POOL_MANAGER = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        string memory network = vm.envString("NETWORK");
        address deployer = vm.addr(pk);

        uint160 flags = uint160(Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.AFTER_SWAP_FLAG);
        bytes memory args = abi.encode(POOL_MANAGER, deployer);
        (address hookAddr, bytes32 salt) = HookMiner.find(CREATE2_DEPLOYER, flags, type(OnTopHook).creationCode, args);

        vm.startBroadcast(pk);
        OnTopHook hook = new OnTopHook{salt: salt}(POOL_MANAGER, deployer);
        require(address(hook) == hookAddr, "hook address mismatch");
        OnTopRouter router = new OnTopRouter(POOL_MANAGER, hook);
        OnTopDistributor distributor = new OnTopDistributor(deployer, deployer);
        OnTopLaunchpad launchpad = new OnTopLaunchpad(POOL_MANAGER, hook, router, distributor, deployer);
        hook.setLaunchpad(address(launchpad));
        distributor.setLaunchpad(address(launchpad));
        vm.stopBroadcast();

        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "poolManager", address(POOL_MANAGER));
        vm.serializeAddress(o, "hook", address(hook));
        vm.serializeAddress(o, "router", address(router));
        vm.serializeAddress(o, "distributor", address(distributor));
        string memory json = vm.serializeAddress(o, "launchpad", address(launchpad));
        vm.writeJson(json, string.concat("deployments/", network, ".json"));

        console2.log("OnTopHook        ", address(hook));
        console2.log("OnTopRouter      ", address(router));
        console2.log("OnTopDistributor ", address(distributor));
        console2.log("OnTopLaunchpad   ", address(launchpad));
    }
}
