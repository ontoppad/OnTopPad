// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title OnTopDistributor
/// @notice Holds each token's holder pot (its share of trading fees, in the pair asset) and pushes it
/// to holders in rounds. Round weights are time-weighted balances (1x under 3 days, 1.5x from 3 days,
/// 2x from 7 days) computed from public Transfer logs; every round commits the snapshot block and an
/// inputs hash so anyone can recompute it. A payment a wallet cannot receive is parked for it to claim.
contract OnTopDistributor is Ownable2Step, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    address public constant NATIVE = address(0);
    /// @notice Max share of a round the keeper may take to cover delivery gas (2%).
    uint16 public constant MAX_DELIVERY_BPS = 200;

    address public launchpad;
    address public keeper;

    mapping(address token => address quote) public quoteOf;
    mapping(address token => uint256) public pot;
    mapping(address token => uint64) public lastRound;
    mapping(address token => uint256) public totalPaid;
    mapping(address quote => mapping(address account => uint256)) public owed;

    event Funded(address indexed token, address indexed quote, uint256 amount, uint256 pot);
    event RoundPaid(
        address indexed token,
        uint64 indexed round,
        uint64 snapshotBlock,
        bytes32 inputsHash,
        uint256 recipients,
        uint256 total,
        uint256 deliveryFee
    );
    event Paid(address indexed token, uint64 indexed round, address indexed account, uint256 amount);
    event Owed(address indexed quote, address indexed account, uint256 amount);
    event OwedClaimed(address indexed quote, address indexed account, uint256 amount);
    event KeeperSet(address keeper);

    error NotLaunchpad();
    error NotKeeper();
    error AlreadySet();
    error BadRound();
    error LengthMismatch();
    error OverPot();
    error FeeTooHigh();
    error BadValue();
    error NothingOwed();

    constructor(address owner_, address keeper_) Ownable(owner_) {
        keeper = keeper_;
        emit KeeperSet(keeper_);
    }

    function setLaunchpad(address launchpad_) external onlyOwner {
        if (launchpad != address(0)) revert AlreadySet();
        launchpad = launchpad_;
    }

    function setKeeper(address keeper_) external onlyOwner {
        keeper = keeper_;
        emit KeeperSet(keeper_);
    }

    /// @notice Add to a token's holder pot. ERC20 quotes are pulled from the launchpad.
    function fund(address token, address quote, uint256 amount) external payable {
        if (msg.sender != launchpad) revert NotLaunchpad();
        if (quote == NATIVE) {
            if (msg.value != amount) revert BadValue();
        } else {
            if (msg.value != 0) revert BadValue();
            IERC20(quote).safeTransferFrom(msg.sender, address(this), amount);
        }
        quoteOf[token] = quote;
        pot[token] += amount;
        emit Funded(token, quote, amount, pot[token]);
    }

    /// @notice Push one batch of a payout round. A round may span several batches with the same id.
    function distribute(
        address token,
        uint64 round,
        uint64 snapshotBlock,
        bytes32 inputsHash,
        address[] calldata accounts,
        uint256[] calldata amounts,
        uint256 deliveryFee
    ) external nonReentrant {
        if (msg.sender != keeper) revert NotKeeper();
        if (accounts.length != amounts.length) revert LengthMismatch();
        if (round < lastRound[token] || round == 0) revert BadRound();
        lastRound[token] = round;

        uint256 sum;
        for (uint256 i; i < amounts.length; ++i) {
            sum += amounts[i];
        }
        if (deliveryFee * 10_000 > (sum + deliveryFee) * MAX_DELIVERY_BPS) revert FeeTooHigh();
        if (sum + deliveryFee > pot[token]) revert OverPot();
        pot[token] -= sum + deliveryFee;
        totalPaid[token] += sum;

        address quote = quoteOf[token];
        for (uint256 i; i < accounts.length; ++i) {
            _pay(quote, accounts[i], amounts[i]);
            emit Paid(token, round, accounts[i], amounts[i]);
        }
        if (deliveryFee != 0) _pay(quote, msg.sender, deliveryFee);
        emit RoundPaid(token, round, snapshotBlock, inputsHash, accounts.length, sum, deliveryFee);
    }

    /// @notice Collect payments that could not be pushed to the caller.
    function claimOwed(address quote) external nonReentrant {
        uint256 amount = owed[quote][msg.sender];
        if (amount == 0) revert NothingOwed();
        owed[quote][msg.sender] = 0;
        if (quote == NATIVE) {
            (bool ok,) = msg.sender.call{value: amount}("");
            if (!ok) revert BadValue();
        } else {
            IERC20(quote).safeTransfer(msg.sender, amount);
        }
        emit OwedClaimed(quote, msg.sender, amount);
    }

    function _pay(address quote, address to, uint256 amount) private {
        bool ok;
        if (quote == NATIVE) {
            // bounded gas and no returndata copy: a hostile receiver can't stall the batch
            assembly ("memory-safe") {
                ok := call(30000, to, amount, 0, 0, 0, 0)
            }
        } else {
            (bool success, bytes memory ret) =
                quote.call{gas: 100_000}(abi.encodeCall(IERC20.transfer, (to, amount)));
            ok = success && (ret.length == 0 || abi.decode(ret, (bool)));
        }
        if (!ok) {
            owed[quote][to] += amount;
            emit Owed(quote, to, amount);
        }
    }
}
