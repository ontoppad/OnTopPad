// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";
import {OnTopToken} from "./OnTopToken.sol";
import {OnTopHook} from "./OnTopHook.sol";
import {OnTopRouter} from "./OnTopRouter.sol";
import {OnTopDistributor} from "./OnTopDistributor.sol";

/// @title OnTopLaunchpad
/// @notice Launches a fixed-supply token straight into a Uniswap v4 pool on OnTopHook.
///  - 93% of supply is single-sided liquidity owned by this contract, which has no code path to remove it.
///  - 7% is the bonus treasury held by OnTopHook; buyers get `bonusBps` extra tokens out of it.
///  - The pool's LP fee is derived from the bonus so every buyer starts at least 1% ahead at the pre-trade price.
///  - Fees: pair-asset side → 75% holders (OnTopDistributor), 15% creator, 10% platform;
///    token side → refills the treasury up to its starting size, the rest is burned.
contract OnTopLaunchpad is IUnlockCallback, Ownable2Step, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    uint256 public constant SUPPLY = 1_000_000_000 ether;
    uint256 public constant TREASURY_BPS = 700;
    uint16 public constant MIN_BONUS_BPS = 300;
    uint16 public constant MAX_BONUS_BPS = 900;
    uint16 public constant HOLDERS_BPS = 7_500;
    uint16 public constant CREATOR_BPS = 1_500;
    int24 public constant TICK_SPACING = 60;
    int24 public constant MAX_START_TICK = 690_000;

    IPoolManager public immutable poolManager;
    OnTopHook public immutable hook;
    OnTopRouter public immutable router;
    OnTopDistributor public immutable distributor;

    struct Launch {
        address creator;
        address quote;
        int24 tickLower;
        int24 tickUpper;
        uint64 launchedAt;
    }

    struct LaunchParams {
        string name;
        string symbol;
        string metadataURI;
        address quote;
        uint16 bonusBps;
        int24 startTick;
        uint256 firstBuyMinOut;
        bytes32 salt;
    }

    enum Action {
        Seed,
        Collect
    }

    mapping(address token => Launch) public launches;
    address[] public tokens;
    mapping(address quote => bool) public quoteAllowed;
    mapping(address token => uint256) public creatorBalance;
    mapping(address quote => uint256) public platformBalance;
    uint256 public launchFee;

    event Launched(
        address indexed token,
        address indexed creator,
        address indexed quote,
        PoolId poolId,
        string name,
        string symbol,
        string metadataURI,
        uint16 bonusBps,
        uint24 fee,
        int24 startTick,
        uint256 treasury
    );
    event Collected(
        address indexed token,
        uint256 quoteFees,
        uint256 tokenFees,
        uint256 toHolders,
        uint256 toCreator,
        uint256 toPlatform,
        uint256 refilled,
        uint256 burned
    );
    event CreatorClaimed(address indexed token, address indexed creator, uint256 amount);
    event QuoteAllowed(address indexed quote, bool allowed);
    event LaunchFeeSet(uint256 fee);
    event PlatformWithdrawn(address indexed quote, address indexed to, uint256 amount);

    error BadName();
    error BadBonus();
    error BadQuote();
    error BadTick();
    error BadValue();
    error NotPoolManager();
    error NotCreator();
    error UnknownToken();

    constructor(
        IPoolManager poolManager_,
        OnTopHook hook_,
        OnTopRouter router_,
        OnTopDistributor distributor_,
        address owner_
    ) Ownable(owner_) {
        poolManager = poolManager_;
        hook = hook_;
        router = router_;
        distributor = distributor_;
        quoteAllowed[address(0)] = true;
        emit QuoteAllowed(address(0), true);
    }

    // ───────────── launch ─────────────

    /// @notice Largest LP fee (ppm) that keeps a buyer >= 1% ahead: (1 - fee) * (1 + bonus) >= 1.01.
    function feeFor(uint16 bonusBps) public pure returns (uint24) {
        uint256 keep = (1_010_000 * 10_000 + (10_000 + bonusBps) - 1) / (10_000 + bonusBps);
        return uint24(1_000_000 - keep);
    }

    /// @notice Launch a token. Any native value above `launchFee` is spent as the creator's first buy.
    function launch(LaunchParams calldata p) external payable nonReentrant returns (address token) {
        uint256 nameLen = bytes(p.name).length;
        uint256 symLen = bytes(p.symbol).length;
        if (nameLen < 2 || nameLen > 32 || symLen < 2 || symLen > 10) revert BadName();
        if (p.bonusBps < MIN_BONUS_BPS || p.bonusBps > MAX_BONUS_BPS) revert BadBonus();
        if (!quoteAllowed[p.quote]) revert BadQuote();
        if (p.startTick % TICK_SPACING != 0 || p.startTick > MAX_START_TICK || p.startTick < -MAX_START_TICK) {
            revert BadTick();
        }
        if (msg.value < launchFee) revert BadValue();
        uint256 firstBuy = msg.value - launchFee;
        if (firstBuy != 0 && p.quote != address(0)) revert BadValue();

        token = address(
            new OnTopToken{salt: keccak256(abi.encode(msg.sender, p.salt))}(
                p.name, p.symbol, p.metadataURI, msg.sender, SUPPLY
            )
        );
        bool tokenIs0 = token < p.quote;
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(tokenIs0 ? token : p.quote),
            currency1: Currency.wrap(tokenIs0 ? p.quote : token),
            fee: feeFor(p.bonusBps),
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });

        uint256 treasury = SUPPLY * TREASURY_BPS / 10_000;
        IERC20(token).safeTransfer(address(hook), treasury);
        hook.register(token, key, tokenIs0, p.bonusBps, uint128(treasury));
        poolManager.initialize(key, TickMath.getSqrtPriceAtTick(p.startTick));

        (int24 lo, int24 hi) = tokenIs0
            ? (p.startTick, TickMath.maxUsableTick(TICK_SPACING))
            : (TickMath.minUsableTick(TICK_SPACING), p.startTick);
        launches[token] = Launch(msg.sender, p.quote, lo, hi, uint64(block.timestamp));
        tokens.push(token);
        poolManager.unlock(abi.encode(Action.Seed, token));

        uint256 dust = IERC20(token).balanceOf(address(this));
        if (dust != 0) OnTopToken(token).burn(dust);
        platformBalance[address(0)] += launchFee;

        emit Launched(
            token,
            msg.sender,
            p.quote,
            key.toId(),
            p.name,
            p.symbol,
            p.metadataURI,
            p.bonusBps,
            key.fee,
            p.startTick,
            treasury
        );

        if (firstBuy != 0) {
            uint256 before = address(this).balance - firstBuy;
            router.buy{value: firstBuy}(token, firstBuy, p.firstBuyMinOut, msg.sender, block.timestamp);
            uint256 refund = address(this).balance - before;
            if (refund != 0) Currency.wrap(address(0)).transfer(msg.sender, refund);
        }
    }

    // ───────────── fees ─────────────

    /// @notice Pull accrued LP fees for `token` and route them. Anyone can call.
    function collect(address token) external nonReentrant {
        Launch memory l = launches[token];
        if (l.creator == address(0)) revert UnknownToken();
        (uint256 a0, uint256 a1) = abi.decode(poolManager.unlock(abi.encode(Action.Collect, token)), (uint256, uint256));
        bool tokenIs0 = token < l.quote;
        (uint256 quoteFees, uint256 tokenFees) = tokenIs0 ? (a1, a0) : (a0, a1);

        uint256 toHolders = quoteFees * HOLDERS_BPS / 10_000;
        uint256 toCreator = quoteFees * CREATOR_BPS / 10_000;
        uint256 toPlatform = quoteFees - toHolders - toCreator;
        if (toHolders != 0) {
            if (l.quote == address(0)) {
                distributor.fund{value: toHolders}(token, l.quote, toHolders);
            } else {
                IERC20(l.quote).forceApprove(address(distributor), toHolders);
                distributor.fund(token, l.quote, toHolders);
            }
        }
        creatorBalance[token] += toCreator;
        platformBalance[l.quote] += toPlatform;

        OnTopHook.Market memory m = hook.market(token);
        uint256 room = m.reserveCap - m.reserve;
        uint256 refilled = tokenFees < room ? tokenFees : room;
        uint256 burned = tokenFees - refilled;
        if (refilled != 0) {
            IERC20(token).safeTransfer(address(hook), refilled);
            hook.refill(token, uint128(refilled));
        }
        if (burned != 0) OnTopToken(token).burn(burned);

        emit Collected(token, quoteFees, tokenFees, toHolders, toCreator, toPlatform, refilled, burned);
    }

    function claimCreator(address token) external nonReentrant {
        Launch memory l = launches[token];
        if (msg.sender != l.creator) revert NotCreator();
        uint256 amount = creatorBalance[token];
        creatorBalance[token] = 0;
        Currency.wrap(l.quote).transfer(msg.sender, amount);
        emit CreatorClaimed(token, msg.sender, amount);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (Action action, address token) = abi.decode(data, (Action, address));
        Launch memory l = launches[token];
        PoolKey memory key = hook.poolKey(token);
        bool tokenIs0 = Currency.unwrap(key.currency0) == token;

        if (action == Action.Seed) {
            uint256 amount = IERC20(token).balanceOf(address(this));
            uint160 sqrtLo = TickMath.getSqrtPriceAtTick(l.tickLower);
            uint160 sqrtHi = TickMath.getSqrtPriceAtTick(l.tickUpper);
            uint128 liquidity = tokenIs0
                ? LiquidityAmounts.getLiquidityForAmount0(sqrtLo, sqrtHi, amount)
                : LiquidityAmounts.getLiquidityForAmount1(sqrtLo, sqrtHi, amount);
            (BalanceDelta delta,) = poolManager.modifyLiquidity(
                key, ModifyLiquidityParams(l.tickLower, l.tickUpper, int256(uint256(liquidity)), 0), ""
            );
            // price sits on the range edge, so only the token side is owed
            uint256 owe = uint128(-(tokenIs0 ? delta.amount0() : delta.amount1()));
            poolManager.sync(Currency.wrap(token));
            IERC20(token).safeTransfer(address(poolManager), owe);
            poolManager.settle();
            return "";
        }

        (BalanceDelta fees,) =
            poolManager.modifyLiquidity(key, ModifyLiquidityParams(l.tickLower, l.tickUpper, 0, 0), "");
        uint256 a0 = uint128(fees.amount0());
        uint256 a1 = uint128(fees.amount1());
        if (a0 != 0) poolManager.take(key.currency0, address(this), a0);
        if (a1 != 0) poolManager.take(key.currency1, address(this), a1);
        return abi.encode(a0, a1);
    }

    // ───────────── views ─────────────

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    // ───────────── owner ─────────────

    function setQuoteAllowed(address quote, bool allowed) external onlyOwner {
        quoteAllowed[quote] = allowed;
        emit QuoteAllowed(quote, allowed);
    }

    function setLaunchFee(uint256 fee) external onlyOwner {
        launchFee = fee;
        emit LaunchFeeSet(fee);
    }

    function withdrawPlatform(address quote, address to, uint256 amount) external onlyOwner nonReentrant {
        platformBalance[quote] -= amount;
        Currency.wrap(quote).transfer(to, amount);
        emit PlatformWithdrawn(quote, to, amount);
    }

    /// @dev Native arrives from PoolManager.take (fees) and router refunds on a first buy.
    receive() external payable {
        if (msg.sender != address(poolManager) && msg.sender != address(router)) revert BadValue();
    }
}
