// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet stand-in for $CHOG. Anyone can claim 1,000 from the faucet once an hour.
contract TestChog is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 1_000 ether;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;
    mapping(address => uint256) public lastClaim;

    error TooSoon(uint256 nextClaimAt);

    constructor() ERC20("Test Chog", "tCHOG") {}

    function faucet() external {
        uint256 next = lastClaim[msg.sender] + FAUCET_COOLDOWN;
        if (lastClaim[msg.sender] != 0 && block.timestamp < next) revert TooSoon(next);
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
