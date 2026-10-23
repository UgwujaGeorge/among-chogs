// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Among Chogs pot
/// @notice Every Chog in a match stakes the same amount of $CHOG. When the match ends, the winning side
///         (the devs or the Ruggers) splits the whole pot equally.
/// @dev The game server decides the winners off-chain and the owner calls `settle`. Dust from the split goes to
///      the owner. A Chog that leaves before the match starts can be refunded.
contract ChogPot is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable chog;
    uint256 public immutable entryFee;

    mapping(bytes32 matchId => uint256) public pot;
    mapping(bytes32 matchId => mapping(uint256 chogId => address)) public entrant;
    mapping(bytes32 matchId => bool) public settled;

    event Entered(bytes32 indexed matchId, uint256 indexed chogId, address indexed player, uint256 amount);
    event Paid(bytes32 indexed matchId, address indexed to, uint256 amount);
    event Settled(bytes32 indexed matchId, uint256 pot, uint256 winners);
    event Refunded(bytes32 indexed matchId, uint256 indexed chogId, address indexed to, uint256 amount);

    error AlreadyEntered();
    error MatchSettled();
    error NoWinners();
    error NotEntered();

    constructor(IERC20 chog_, uint256 entryFee_, address owner_) Ownable(owner_) {
        chog = chog_;
        entryFee = entryFee_;
    }

    /// @notice Stake the entry fee for one Chog in a match. One stake per Chog per match.
    function enter(bytes32 matchId, uint256 chogId) external nonReentrant {
        if (settled[matchId]) revert MatchSettled();
        if (entrant[matchId][chogId] != address(0)) revert AlreadyEntered();
        entrant[matchId][chogId] = msg.sender;
        pot[matchId] += entryFee;
        chog.safeTransferFrom(msg.sender, address(this), entryFee);
        emit Entered(matchId, chogId, msg.sender, entryFee);
    }

    /// @notice Splits the pot equally between the winning side's wallets.
    function settle(bytes32 matchId, address[] calldata winners) external onlyOwner nonReentrant {
        if (settled[matchId]) revert MatchSettled();
        uint256 n = winners.length;
        if (n == 0) revert NoWinners();
        settled[matchId] = true;
        uint256 total = pot[matchId];
        uint256 each = total / n;
        for (uint256 i; i < n; i++) {
            chog.safeTransfer(winners[i], each);
            emit Paid(matchId, winners[i], each);
        }
        uint256 dust = total - each * n;
        if (dust > 0) chog.safeTransfer(owner(), dust);
        emit Settled(matchId, total, n);
    }

    /// @notice Gives a Chog's stake back (it left before the match started, or the match was cancelled).
    function refund(bytes32 matchId, uint256 chogId) external onlyOwner nonReentrant {
        if (settled[matchId]) revert MatchSettled();
        address to = entrant[matchId][chogId];
        if (to == address(0)) revert NotEntered();
        entrant[matchId][chogId] = address(0);
        pot[matchId] -= entryFee;
        chog.safeTransfer(to, entryFee);
        emit Refunded(matchId, chogId, to, entryFee);
    }
}
