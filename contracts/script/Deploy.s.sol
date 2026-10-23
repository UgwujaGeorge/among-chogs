// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ChogPot} from "../src/ChogPot.sol";

/// Uses chog-1's TestChog (test $CHOG) so one faucet works for both games.
/// TCHOG=0x... forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_KEY
contract Deploy is Script {
    function run() external {
        address tchog = vm.envAddress("TCHOG");
        vm.startBroadcast();
        ChogPot pot = new ChogPot(IERC20(tchog), 100 ether, msg.sender);
        vm.stopBroadcast();
        console.log("ChogPot", address(pot));
    }
}
