// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {OnTopHook} from "./OnTopHook.sol";

/// @title OnTopRouter
/// @notice Exact-input buys and sells against OnTop pools. The buyer is forwarded to OnTopHook so the
/// head-start bonus lands in the buyer's wallet in the same transaction.
contract OnTopRouter is IUnlockCallback {
    using SafeERC20 for IERC20;

    IPoolManager public immutable poolManager;
    OnTopHook public immutable hook;

    struct SwapData {
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
        address payer;
        address to;
        address trader; // who OnTopHook credits: the receiver on buys, the seller on sells
    }

    error NotPoolManager();
    error NotListed();
    error Expired();
    error Slippage(uint256 out, uint256 minOut);
    error BadValue();

    constructor(IPoolManager poolManager_, OnTopHook hook_) {
        poolManager = poolManager_;
        hook = hook_;
    }

    /// @notice Spend `amountIn` of the quote asset on `token`. Returns base tokens out (bonus arrives on top).
    function buy(address token, uint256 amountIn, uint256 minOut, address to, uint256 deadline)
        external
        payable
        returns (uint256 out)
    {
        OnTopHook.Market memory m = _market(token, deadline);
        Currency quote = m.tokenIs0 ? m.key.currency1 : m.key.currency0;
        if (quote.isAddressZero() ? msg.value != amountIn : msg.value != 0) revert BadValue();

        uint256 paid;
        (out, paid) = _swap(SwapData(m.key, !m.tokenIs0, amountIn, msg.sender, to, to));
        if (out < minOut) revert Slippage(out, minOut);
        // a buy can hit the end of the curve; hand back whatever native quote was not consumed
        if (quote.isAddressZero() && paid < amountIn) quote.transfer(msg.sender, amountIn - paid);
    }

    /// @notice Sell `amountIn` tokens for the quote asset. Needs a prior ERC20 approval to this router.
    function sell(address token, uint256 amountIn, uint256 minOut, address to, uint256 deadline)
        external
        returns (uint256 out)
    {
        OnTopHook.Market memory m = _market(token, deadline);
        (out,) = _swap(SwapData(m.key, m.tokenIs0, amountIn, msg.sender, to, msg.sender));
        if (out < minOut) revert Slippage(out, minOut);
    }

    function unlockCallback(bytes calldata raw) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        SwapData memory d = abi.decode(raw, (SwapData));

        BalanceDelta delta = poolManager.swap(
            d.key,
            SwapParams({
                zeroForOne: d.zeroForOne,
                amountSpecified: -int256(d.amountIn),
                sqrtPriceLimitX96: d.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            abi.encode(d.trader)
        );

        (Currency cin, Currency cout) =
            d.zeroForOne ? (d.key.currency0, d.key.currency1) : (d.key.currency1, d.key.currency0);
        (int128 a0, int128 a1) = (delta.amount0(), delta.amount1());
        uint256 paid = uint128(-(d.zeroForOne ? a0 : a1));
        uint256 out = uint128(d.zeroForOne ? a1 : a0);

        if (cin.isAddressZero()) {
            poolManager.settle{value: paid}();
        } else {
            poolManager.sync(cin);
            IERC20(Currency.unwrap(cin)).safeTransferFrom(d.payer, address(poolManager), paid);
            poolManager.settle();
        }
        poolManager.take(cout, d.to, out);
        return abi.encode(out, paid);
    }

    function _market(address token, uint256 deadline) private view returns (OnTopHook.Market memory m) {
        if (block.timestamp > deadline) revert Expired();
        m = hook.market(token);
        if (address(m.key.hooks) == address(0)) revert NotListed();
    }

    function _swap(SwapData memory d) private returns (uint256 out, uint256 paid) {
        (out, paid) = abi.decode(poolManager.unlock(abi.encode(d)), (uint256, uint256));
    }

    receive() external payable {
        if (msg.sender != address(poolManager)) revert BadValue();
    }
}
