// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "v4-core/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";

/// @title OnTopHook
/// @notice Uniswap v4 hook for every OnTop pool. Pays the head-start bonus on buys out of each token's
/// locked treasury and emits one Trade event per swap, whatever router the swap came through.
/// Only OnTopLaunchpad can create pools on this hook or add liquidity to them.
contract OnTopHook is IHooks {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    struct Market {
        PoolKey key;
        bool tokenIs0;
        uint16 bonusBps;
        uint128 reserve;
        uint128 reserveCap;
    }

    IPoolManager public immutable poolManager;
    address private immutable deployer;
    address public launchpad;

    mapping(address token => Market) internal markets;
    mapping(PoolId id => address token) public tokenOf;

    event Trade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 quoteAmount,
        uint256 tokenAmount,
        uint256 bonus,
        uint160 sqrtPriceX96,
        int24 tick
    );
    event Refilled(address indexed token, uint256 amount, uint256 reserve);

    error NotPoolManager();
    error NotLaunchpad();
    error AlreadySet();
    error HookNotImplemented();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    modifier onlyLaunchpad() {
        if (msg.sender != launchpad) revert NotLaunchpad();
        _;
    }

    constructor(IPoolManager poolManager_, address deployer_) {
        poolManager = poolManager_;
        deployer = deployer_;
        Hooks.validateHookPermissions(IHooks(address(this)), permissions());
    }

    function permissions() public pure returns (Hooks.Permissions memory p) {
        p.beforeInitialize = true;
        p.beforeAddLiquidity = true;
        p.afterSwap = true;
    }

    /// @notice One-time wiring, done in the deploy script right after the launchpad exists.
    function setLaunchpad(address launchpad_) external {
        if (msg.sender != deployer) revert NotLaunchpad();
        if (launchpad != address(0)) revert AlreadySet();
        launchpad = launchpad_;
    }

    // ───────────── launchpad hooks ─────────────

    /// @dev Treasury tokens must already be transferred to this contract.
    function register(address token, PoolKey calldata key, bool tokenIs0, uint16 bonusBps, uint128 reserve)
        external
        onlyLaunchpad
    {
        markets[token] = Market(key, tokenIs0, bonusBps, reserve, reserve);
        tokenOf[key.toId()] = token;
    }

    /// @dev Refill tokens must already be transferred to this contract.
    function refill(address token, uint128 amount) external onlyLaunchpad {
        Market storage m = markets[token];
        m.reserve += amount;
        emit Refilled(token, amount, m.reserve);
    }

    // ───────────── views ─────────────

    function market(address token) external view returns (Market memory) {
        return markets[token];
    }

    function poolKey(address token) external view returns (PoolKey memory) {
        return markets[token].key;
    }

    /// @notice Bonus a buy of `bought` base tokens would receive right now.
    function bonusFor(address token, uint256 bought) public view returns (uint256 bonus) {
        Market storage m = markets[token];
        bonus = bought * m.bonusBps / 10_000;
        if (bonus > m.reserve) bonus = m.reserve;
    }

    // ───────────── v4 hooks ─────────────

    function beforeInitialize(address sender, PoolKey calldata, uint160) external view onlyPoolManager returns (bytes4) {
        if (sender != launchpad) revert NotLaunchpad();
        return IHooks.beforeInitialize.selector;
    }

    function beforeAddLiquidity(address sender, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != launchpad) revert NotLaunchpad();
        return IHooks.beforeAddLiquidity.selector;
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta delta, bytes calldata hookData)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        PoolId id = key.toId();
        address token = tokenOf[id];
        Market storage m = markets[token];
        int128 t = m.tokenIs0 ? delta.amount0() : delta.amount1();
        int128 q = m.tokenIs0 ? delta.amount1() : delta.amount0();
        // Routers pass the real buyer in hookData; anything else credits the transaction signer.
        address trader = hookData.length == 32 ? abi.decode(hookData, (address)) : tx.origin;
        (uint160 sqrtPriceX96, int24 tick,,) = poolManager.getSlot0(id);

        if (t > 0) {
            uint256 bought = uint128(t);
            uint256 bonus = bonusFor(token, bought);
            if (bonus != 0) {
                m.reserve -= uint128(bonus);
                IERC20(token).safeTransfer(trader, bonus);
            }
            emit Trade(token, trader, true, uint128(-q), bought, bonus, sqrtPriceX96, tick);
        } else {
            emit Trade(token, trader, false, uint128(q), uint128(-t), 0, sqrtPriceX96, tick);
        }
        return (IHooks.afterSwap.selector, 0);
    }

    // ───────────── unused hooks ─────────────

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        pure
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
