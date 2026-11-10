// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {FullMath} from "v4-core/libraries/FullMath.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {PoolModifyLiquidityTest} from "v4-core/test/PoolModifyLiquidityTest.sol";
import {OnTopHook} from "../src/OnTopHook.sol";
import {OnTopRouter} from "../src/OnTopRouter.sol";
import {OnTopDistributor} from "../src/OnTopDistributor.sol";
import {OnTopLaunchpad} from "../src/OnTopLaunchpad.sol";
import {OnTopToken} from "../src/OnTopToken.sol";

contract RejectsEth {}

contract OnTopTest is Test {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    // 10 ETH start FDV: 1e8 tokens per ETH → tick ≈ 184206, aligned down to spacing 60
    int24 constant START_TICK = 184_200;
    uint16 constant BONUS = 500;

    PoolManager manager;
    OnTopHook hook;
    OnTopRouter router;
    OnTopDistributor distributor;
    OnTopLaunchpad pad;

    address keeper = makeAddr("keeper");
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        manager = new PoolManager(address(this));
        uint160 flags = uint160(Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.AFTER_SWAP_FLAG);
        address hookAddr = address(flags | (uint160(0x4444) << 144));
        deployCodeTo("OnTopHook.sol:OnTopHook", abi.encode(manager, address(this)), hookAddr);
        hook = OnTopHook(hookAddr);
        router = new OnTopRouter(manager, hook);
        distributor = new OnTopDistributor(address(this), keeper);
        pad = new OnTopLaunchpad(manager, hook, router, distributor, address(this));
        hook.setLaunchpad(address(pad));
        distributor.setLaunchpad(address(pad));

        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _launch(uint16 bonus, uint256 firstBuy) internal returns (address token) {
        vm.prank(creator);
        token = pad.launch{value: firstBuy}(
            OnTopLaunchpad.LaunchParams({
                name: "Arcade Cat",
                symbol: "ACAT",
                metadataURI: "https://testnet.ontoppad.com/api/metadata/1",
                quote: address(0),
                bonusBps: bonus,
                startTick: START_TICK,
                firstBuyMinOut: 0,
                salt: bytes32(uint256(1))
            })
        );
    }

    function _buy(address who, address token, uint256 amount) internal returns (uint256 out) {
        vm.prank(who);
        out = router.buy{value: amount}(token, amount, 0, who, block.timestamp);
    }

    function _sell(address who, address token, uint256 amount) internal returns (uint256 out) {
        vm.startPrank(who);
        IERC20(token).approve(address(router), amount);
        out = router.sell(token, amount, 0, who, block.timestamp);
        vm.stopPrank();
    }

    // ───────────── launch ─────────────

    function test_launch_locksLiquidityAndTreasury() public {
        address token = _launch(BONUS, 0);
        uint256 treasury = pad.SUPPLY() * pad.TREASURY_BPS() / 10_000;

        assertEq(IERC20(token).balanceOf(address(hook)), treasury);
        assertEq(IERC20(token).balanceOf(address(pad)), 0);
        assertApproxEqRel(IERC20(token).balanceOf(address(manager)), pad.SUPPLY() - treasury, 1e12);
        assertEq(OnTopToken(token).creator(), creator);

        OnTopHook.Market memory m = hook.market(token);
        assertEq(m.key.fee, pad.feeFor(BONUS));
        assertEq(m.reserve, treasury);
        // price starts on the range edge: liquidity turns active with the first buy
        assertEq(IPoolManager(address(manager)).getLiquidity(m.key.toId()), 0);
        _buy(alice, token, 1e12);
        assertGt(IPoolManager(address(manager)).getLiquidity(m.key.toId()), 0);
        assertEq(pad.tokenCount(), 1);
    }

    function test_launch_rejectsBadParams() public {
        vm.startPrank(creator);
        OnTopLaunchpad.LaunchParams memory p = OnTopLaunchpad.LaunchParams(
            "Arcade Cat", "ACAT", "", address(0), BONUS, START_TICK, 0, bytes32(0)
        );
        p.bonusBps = 200;
        vm.expectRevert(OnTopLaunchpad.BadBonus.selector);
        pad.launch(p);
        p.bonusBps = BONUS;
        p.startTick = START_TICK + 1;
        vm.expectRevert(OnTopLaunchpad.BadTick.selector);
        pad.launch(p);
        p.startTick = START_TICK;
        p.symbol = "A";
        vm.expectRevert(OnTopLaunchpad.BadName.selector);
        pad.launch(p);
        p.symbol = "ACAT";
        p.quote = address(0xBEEF);
        vm.expectRevert(OnTopLaunchpad.BadQuote.selector);
        pad.launch(p);
        vm.stopPrank();
    }

    function test_launch_firstBuyGoesToCreatorWithBonus() public {
        address token = _launch(BONUS, 0.5 ether);
        uint256 bal = IERC20(token).balanceOf(creator);
        assertGt(bal, 0);
        OnTopHook.Market memory m = hook.market(token);
        uint256 paidBonus = m.reserveCap - m.reserve;
        assertEq(paidBonus, (bal - paidBonus) * BONUS / 10_000);
    }

    // ───────────── trading ─────────────

    function test_buy_paysBonusOnTop() public {
        address token = _launch(BONUS, 0);
        uint256 out = _buy(alice, token, 0.1 ether);
        assertEq(IERC20(token).balanceOf(alice), out + out * BONUS / 10_000);
    }

    function test_buy_startsAtLeastOnePercentAhead() public {
        address token = _launch(BONUS, 0);
        uint256 amountIn = 1e12; // small enough that price impact is negligible
        (uint160 sqrtP,,,) = IPoolManager(address(manager)).getSlot0(hook.poolKey(token).toId());
        uint256 atSpot = FullMath.mulDiv(amountIn, uint256(sqrtP) * sqrtP, 1 << 192); // tokens per wei at spot
        _buy(alice, token, amountIn);
        assertGe(IERC20(token).balanceOf(alice) * 10_000, atSpot * 10_099);
    }

    function test_sell_returnsQuote() public {
        address token = _launch(BONUS, 0);
        _buy(alice, token, 1 ether);
        uint256 before = alice.balance;
        uint256 out = _sell(alice, token, IERC20(token).balanceOf(alice) / 2);
        assertEq(alice.balance - before, out);
        assertGt(out, 0);
    }

    function test_buy_respectsSlippageAndDeadline() public {
        address token = _launch(BONUS, 0);
        vm.prank(alice);
        vm.expectRevert();
        router.buy{value: 1 ether}(token, 1 ether, type(uint256).max, alice, block.timestamp);
        vm.prank(alice);
        vm.expectRevert(OnTopRouter.Expired.selector);
        router.buy{value: 1 ether}(token, 1 ether, 0, alice, block.timestamp - 1);
    }

    function test_bonusCappedByTreasury() public {
        address token = _launch(900, 0);
        _buy(alice, token, 60 ether); // buys most of the curve; bonus would exceed what's left
        _buy(bob, token, 30 ether);
        assertLe(hook.market(token).reserve, hook.market(token).reserveCap);
        assertEq(IERC20(token).balanceOf(address(hook)), hook.market(token).reserve);
    }

    // ───────────── economics ─────────────

    function testFuzz_feeFor_keepsBuyerAheadAndWashTradingNegative(uint16 bonus) public view {
        bonus = uint16(bound(bonus, pad.MIN_BONUS_BPS(), pad.MAX_BONUS_BPS()));
        uint256 keep = 1_000_000 - pad.feeFor(bonus);
        assertGe(keep * (10_000 + bonus), 1_010_000 * 10_000); // buyer >= +1%
        assertLt(keep * keep * (10_000 + bonus), 1e12 * 10_000); // buy→sell round trip loses
    }

    function testFuzz_washTradeLoses(uint256 amount, uint16 bonus) public {
        bonus = uint16(bound(bonus, pad.MIN_BONUS_BPS(), pad.MAX_BONUS_BPS()));
        amount = bound(amount, 1e9, 20 ether);
        address token = _launch(bonus, 0);
        uint256 start = alice.balance;
        _buy(alice, token, amount);
        _sell(alice, token, IERC20(token).balanceOf(alice));
        assertLt(alice.balance, start);
    }

    // ───────────── fees ─────────────

    function test_collect_routesFees() public {
        address token = _launch(BONUS, 0);
        _buy(alice, token, 2 ether);
        _sell(alice, token, IERC20(token).balanceOf(alice) / 2);

        uint256 hookBefore = IERC20(token).balanceOf(address(hook));
        uint256 supplyBefore = IERC20(token).totalSupply();
        vm.recordLogs();
        pad.collect(token);

        uint256 fee = pad.feeFor(BONUS);
        uint256 quoteFees = 2 ether * fee / 1e6;
        uint256 pot = distributor.pot(token);
        assertApproxEqAbs(pot, quoteFees * 7_500 / 10_000, 10);
        assertApproxEqAbs(pad.creatorBalance(token), quoteFees * 1_500 / 10_000, 10);
        assertApproxEqAbs(pad.platformBalance(address(0)), quoteFees * 1_000 / 10_000, 10);
        assertEq(address(distributor).balance, pot);

        // token-side fees refill the treasury first; the remainder is burned
        OnTopHook.Market memory m = hook.market(token);
        uint256 refilled = IERC20(token).balanceOf(address(hook)) - hookBefore;
        uint256 burned = supplyBefore - IERC20(token).totalSupply();
        assertGt(refilled + burned, 0);
        assertLe(m.reserve, m.reserveCap);

        // collecting twice does not double count
        pad.collect(token);
        assertEq(distributor.pot(token), pot);
    }

    function test_claimCreator_onlyCreator() public {
        address token = _launch(BONUS, 0);
        _buy(alice, token, 1 ether);
        pad.collect(token);
        uint256 owedToCreator = pad.creatorBalance(token);
        vm.expectRevert(OnTopLaunchpad.NotCreator.selector);
        vm.prank(alice);
        pad.claimCreator(token);
        uint256 before = creator.balance;
        vm.prank(creator);
        pad.claimCreator(token);
        assertEq(creator.balance - before, owedToCreator);
    }

    function test_withdrawPlatform_onlyOwner() public {
        address token = _launch(BONUS, 0);
        _buy(alice, token, 1 ether);
        pad.collect(token);
        uint256 amount = pad.platformBalance(address(0));
        vm.prank(alice);
        vm.expectRevert();
        pad.withdrawPlatform(address(0), alice, amount);
        pad.withdrawPlatform(address(0), bob, amount);
        assertEq(pad.platformBalance(address(0)), 0);
    }

    // ───────────── payouts ─────────────

    function test_distribute_paysHoldersAndParksFailures() public {
        address token = _launch(BONUS, 0);
        _buy(alice, token, 4 ether);
        pad.collect(token);
        uint256 pot = distributor.pot(token);

        address rejecter = address(new RejectsEth());
        address[] memory accounts = new address[](3);
        uint256[] memory amounts = new uint256[](3);
        (accounts[0], accounts[1], accounts[2]) = (alice, bob, rejecter);
        uint256 fee = pot / 100;
        uint256 each = (pot - fee) / 3;
        (amounts[0], amounts[1], amounts[2]) = (each, each, each);

        uint256 aliceBefore = alice.balance;
        vm.prank(keeper);
        distributor.distribute(token, 1, uint64(block.number), keccak256("inputs"), accounts, amounts, fee);

        assertEq(alice.balance - aliceBefore, each);
        assertEq(bob.balance, 100 ether + each);
        assertEq(keeper.balance, fee);
        assertEq(distributor.owed(address(0), rejecter), each);
        assertEq(distributor.totalPaid(token), each * 3);
    }

    function test_distribute_guards() public {
        address token = _launch(BONUS, 0);
        _buy(alice, token, 1 ether);
        pad.collect(token);
        uint256 pot = distributor.pot(token);
        address[] memory accounts = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        accounts[0] = alice;

        amounts[0] = pot + 1;
        vm.startPrank(keeper);
        vm.expectRevert(OnTopDistributor.OverPot.selector);
        distributor.distribute(token, 1, 1, bytes32(0), accounts, amounts, 0);

        amounts[0] = pot / 2;
        vm.expectRevert(OnTopDistributor.FeeTooHigh.selector);
        distributor.distribute(token, 1, 1, bytes32(0), accounts, amounts, pot / 4);

        distributor.distribute(token, 2, 1, bytes32(0), accounts, amounts, 0);
        vm.expectRevert(OnTopDistributor.BadRound.selector);
        distributor.distribute(token, 1, 1, bytes32(0), accounts, amounts, 0);
        vm.stopPrank();

        vm.expectRevert(OnTopDistributor.NotKeeper.selector);
        distributor.distribute(token, 3, 1, bytes32(0), accounts, amounts, 0);
    }

    // ───────────── hook gating ─────────────

    function test_hook_blocksForeignPoolsAndLiquidity() public {
        address token = _launch(BONUS, 0);
        PoolKey memory key = hook.poolKey(token);

        PoolKey memory rogue = key;
        rogue.fee = 3000;
        vm.expectRevert();
        manager.initialize(rogue, TickMath.getSqrtPriceAtTick(0));

        PoolModifyLiquidityTest lp = new PoolModifyLiquidityTest(manager);
        vm.deal(address(this), 10 ether);
        vm.expectRevert();
        lp.modifyLiquidity{value: 1 ether}(key, ModifyLiquidityParams(-600, 600, 1e18, 0), "");
    }

    function test_hook_wiringIsOneShot() public {
        vm.expectRevert(OnTopHook.AlreadySet.selector);
        hook.setLaunchpad(alice);
        vm.expectRevert(OnTopHook.NotLaunchpad.selector);
        hook.refill(address(1), 1);
    }

    receive() external payable {}
}
