// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ChogPot} from "../src/ChogPot.sol";
import {TestChog} from "./TestChog.sol";

contract ChogPotTest is Test {
    TestChog chog;
    ChogPot pot;
    address owner = address(0xA11CE);
    address[4] players = [address(0x1), address(0x2), address(0x3), address(0x4)];
    bytes32 constant M = keccak256("ABCD-1");

    function setUp() public {
        chog = new TestChog();
        pot = new ChogPot(chog, 100 ether, owner);
        for (uint256 i; i < 4; i++) {
            vm.startPrank(players[i]);
            chog.faucet();
            chog.approve(address(pot), type(uint256).max);
            vm.stopPrank();
        }
    }

    function enterAll() internal {
        for (uint256 i; i < 4; i++) {
            vm.prank(players[i]);
            pot.enter(M, 100 + i);
        }
    }

    function test_enter() public {
        enterAll();
        assertEq(pot.pot(M), 400 ether);
        assertEq(pot.entrant(M, 101), players[1]);
        assertEq(chog.balanceOf(players[0]), 900 ether);
    }

    function test_cannotEnterTwice() public {
        vm.prank(players[0]);
        pot.enter(M, 7);
        vm.prank(players[1]);
        vm.expectRevert(ChogPot.AlreadyEntered.selector);
        pot.enter(M, 7);
    }

    function test_settleSplitsEqually() public {
        enterAll();
        address[] memory w = new address[](3);
        w[0] = players[0];
        w[1] = players[1];
        w[2] = players[2];
        vm.prank(owner);
        pot.settle(M, w);
        // 400 / 3 = 133.333...: winners get 133.33 each, the dust goes to the owner.
        uint256 each = uint256(400 ether) / 3;
        assertEq(chog.balanceOf(players[0]), 900 ether + each);
        assertEq(chog.balanceOf(players[3]), 900 ether);
        assertEq(chog.balanceOf(owner), 400 ether - each * 3);
        assertEq(chog.balanceOf(address(pot)), 0);
        assertTrue(pot.settled(M));
    }

    function test_onlyOwnerSettles() public {
        enterAll();
        address[] memory w = new address[](1);
        w[0] = players[0];
        vm.prank(players[0]);
        vm.expectRevert();
        pot.settle(M, w);
    }

    function test_cannotSettleTwiceOrEnterAfter() public {
        enterAll();
        address[] memory w = new address[](1);
        w[0] = players[3];
        vm.startPrank(owner);
        pot.settle(M, w);
        vm.expectRevert(ChogPot.MatchSettled.selector);
        pot.settle(M, w);
        vm.stopPrank();
        vm.prank(players[0]);
        vm.expectRevert(ChogPot.MatchSettled.selector);
        pot.enter(M, 999);
    }

    function test_refund() public {
        enterAll();
        vm.prank(owner);
        pot.refund(M, 102);
        assertEq(chog.balanceOf(players[2]), 1000 ether);
        assertEq(pot.pot(M), 300 ether);
        assertEq(pot.entrant(M, 102), address(0));
        vm.prank(owner);
        vm.expectRevert(ChogPot.NotEntered.selector);
        pot.refund(M, 102);
    }
}
