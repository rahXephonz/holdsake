// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {HoldsakeFunds} from "../src/HoldsakeFunds.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";
import {BaseTest} from "./Base.t.sol";

contract HoldsakeFundsTest is BaseTest {
    HoldsakeFunds internal funds;
    uint64 internal unlockAt;

    function setUp() public override {
        super.setUp();
        funds = new HoldsakeFunds(tokenList);
        unlockAt = uint64(block.timestamp + 365 days);
        address[3] memory people = [alice, bob, carol];
        for (uint256 i; i < people.length; ++i) {
            vm.startPrank(people[i]);
            usdg.approve(address(funds), type(uint256).max);
            tsla.approve(address(funds), type(uint256).max);
            aapl.approve(address(funds), type(uint256).max);
            nvda.approve(address(funds), type(uint256).max);
            amzn.approve(address(funds), type(uint256).max);
            feeToken.approve(address(funds), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _mix2() internal view returns (HoldsakeFunds.MixEntry[] memory mix) {
        mix = new HoldsakeFunds.MixEntry[](2);
        mix[0] = HoldsakeFunds.MixEntry(address(tsla), 1e16);
        mix[1] = HoldsakeFunds.MixEntry(address(aapl), 1e16);
    }

    function _create() internal returns (uint256 id) {
        vm.prank(alice);
        id = funds.createFund(bob, unlockAt, _mix2());
    }

    // --- create ------------------------------------------------------------------------------

    function test_create_recordsFixedTerms() public {
        uint256 id = _create();
        (
            HoldsakeFunds.Fund memory fund,
            HoldsakeFunds.MixEntry[] memory mix,
            uint256[] memory bal
        ) = funds.getFund(id);
        assertEq(fund.creator, alice);
        assertEq(fund.beneficiary, bob);
        assertEq(fund.unlockAt, unlockAt);
        assertEq(mix.length, 2);
        assertEq(funds.minRaw(id, address(tsla)), 1e16);
        assertEq(bal[0] + bal[1], 0);
    }

    function test_create_unlockBounds() public {
        HoldsakeFunds.MixEntry[] memory mix = _mix2();
        vm.startPrank(alice);
        vm.expectRevert(HoldsakeFunds.InvalidUnlock.selector);
        funds.createFund(bob, uint64(block.timestamp), mix);
        vm.expectRevert(HoldsakeFunds.InvalidUnlock.selector);
        funds.createFund(bob, uint64(block.timestamp + 25 * 365 days + 1), mix);
        funds.createFund(bob, uint64(block.timestamp + 25 * 365 days), mix);
        funds.createFund(bob, uint64(block.timestamp + 1), mix);
        vm.stopPrank();
    }

    function test_create_rejectsBadMix() public {
        vm.startPrank(alice);
        vm.expectRevert(HoldsakeFunds.EmptyMix.selector);
        funds.createFund(bob, unlockAt, new HoldsakeFunds.MixEntry[](0));

        HoldsakeFunds.MixEntry[] memory four = new HoldsakeFunds.MixEntry[](4);
        four[0] = HoldsakeFunds.MixEntry(address(tsla), 1);
        four[1] = HoldsakeFunds.MixEntry(address(aapl), 1);
        four[2] = HoldsakeFunds.MixEntry(address(nvda), 1);
        four[3] = HoldsakeFunds.MixEntry(address(amzn), 1);
        vm.expectRevert(HoldsakeFunds.TooManyStocks.selector);
        funds.createFund(bob, unlockAt, four);

        HoldsakeFunds.MixEntry[] memory dup = new HoldsakeFunds.MixEntry[](2);
        dup[0] = HoldsakeFunds.MixEntry(address(tsla), 1);
        dup[1] = HoldsakeFunds.MixEntry(address(tsla), 1);
        vm.expectRevert(
            abi.encodeWithSelector(HoldsakeFunds.DuplicateToken.selector, address(tsla))
        );
        funds.createFund(bob, unlockAt, dup);

        HoldsakeFunds.MixEntry[] memory zero = new HoldsakeFunds.MixEntry[](1);
        zero[0] = HoldsakeFunds.MixEntry(address(tsla), 0);
        vm.expectRevert(HoldsakeFunds.ZeroMinimum.selector);
        funds.createFund(bob, unlockAt, zero);

        HoldsakeFunds.MixEntry[] memory fake = new HoldsakeFunds.MixEntry[](1);
        fake[0] = HoldsakeFunds.MixEntry(address(unlisted), 1);
        vm.expectRevert(
            abi.encodeWithSelector(HoldsakeFunds.TokenNotAllowed.selector, address(unlisted))
        );
        funds.createFund(bob, unlockAt, fake);

        vm.expectRevert(HoldsakeFunds.ZeroAddress.selector);
        funds.createFund(address(0), unlockAt, _mix2());
        vm.stopPrank();
    }

    // --- contribute --------------------------------------------------------------------------

    function test_contribute_anyoneMixTokensOnly() public {
        uint256 id = _create();
        vm.prank(carol);
        funds.contribute(id, address(tsla), 3e18);
        vm.prank(alice);
        funds.contribute(id, address(tsla), 1e18);
        assertEq(funds.balanceOf(id, address(tsla)), 4e18);
        assertEq(funds.owed(address(tsla)), 4e18);

        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(HoldsakeFunds.NotInMix.selector, address(nvda)));
        funds.contribute(id, address(nvda), 1e18);
    }

    function test_contribute_belowMinimumRejected() public {
        uint256 id = _create();
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(HoldsakeFunds.BelowMinimum.selector, 1e16 - 1, 1e16));
        funds.contribute(id, address(tsla), 1e16 - 1);
    }

    function test_contribute_minimumCheckedOnWhatArrived() public {
        HoldsakeFunds.MixEntry[] memory mix = new HoldsakeFunds.MixEntry[](1);
        mix[0] = HoldsakeFunds.MixEntry(address(feeToken), 100e18);
        vm.prank(alice);
        uint256 id = funds.createFund(bob, unlockAt, mix);

        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(HoldsakeFunds.BelowMinimum.selector, 99e18, 100e18));
        funds.contribute(id, address(feeToken), 100e18);
    }

    function test_contribute_unknownFund() public {
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(HoldsakeFunds.UnknownFund.selector, 9));
        funds.contribute(9, address(tsla), 1e18);
    }

    // --- withdraw ----------------------------------------------------------------------------

    function test_withdraw_beneficiaryAfterUnlock() public {
        uint256 id = _create();
        vm.startPrank(carol);
        funds.contribute(id, address(tsla), 3e18);
        funds.contribute(id, address(aapl), 2e18);
        vm.stopPrank();

        vm.warp(unlockAt - 1);
        vm.prank(bob);
        vm.expectRevert(HoldsakeFunds.Locked.selector);
        funds.withdraw(id, bob);

        vm.warp(unlockAt);
        vm.prank(alice);
        vm.expectRevert(HoldsakeFunds.NotBeneficiary.selector);
        funds.withdraw(id, alice);

        uint256 tslaBefore = tsla.balanceOf(carol);
        vm.prank(bob);
        funds.withdraw(id, carol); // beneficiary picks where it lands
        assertEq(tsla.balanceOf(carol), tslaBefore + 3e18);
        assertEq(funds.owed(address(tsla)), 0);
        assertEq(funds.owed(address(aapl)), 0);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(HoldsakeFunds.NothingToWithdraw.selector, id));
        funds.withdraw(id, bob);
    }

    function test_withdraw_pausedTokenDoesNotLockTheRest() public {
        uint256 id = _create();
        vm.startPrank(carol);
        funds.contribute(id, address(tsla), 3e18);
        funds.contribute(id, address(aapl), 2e18);
        vm.stopPrank();
        vm.warp(unlockAt);
        tsla.setPaused(true);

        vm.startPrank(bob);
        vm.expectRevert(MockStockToken.TokenPaused.selector);
        funds.withdraw(id, bob);
        funds.withdrawToken(id, address(aapl), bob);
        tsla.setPaused(false);
        funds.withdrawToken(id, address(tsla), bob);
        vm.stopPrank();
        assertEq(tsla.balanceOf(address(funds)), 0);
    }

    function test_withdraw_blockedBeneficiaryWithdrawsElsewhere() public {
        uint256 id = _create();
        vm.prank(carol);
        funds.contribute(id, address(tsla), 3e18);
        vm.warp(unlockAt);
        tsla.setBlocked(bob, true);

        vm.prank(bob);
        funds.withdraw(id, carol);
        assertEq(funds.balanceOf(id, address(tsla)), 0);
    }

    function test_contributeAfterWithdrawCanBeWithdrawnAgain() public {
        uint256 id = _create();
        vm.prank(carol);
        funds.contribute(id, address(tsla), 1e18);
        vm.warp(unlockAt);
        vm.prank(bob);
        funds.withdraw(id, bob);

        vm.prank(carol);
        funds.contribute(id, address(tsla), 1e18);
        vm.prank(bob);
        funds.withdrawToken(id, address(tsla), bob);
        assertEq(tsla.balanceOf(address(funds)), 0);
    }

    // --- fuzz --------------------------------------------------------------------------------

    function testFuzz_withdrawOnlyAfterUnlock(uint96 amount, uint64 elapsed) public {
        amount = uint96(bound(amount, 1e16, 1_000_000e18));
        elapsed = uint64(bound(elapsed, 0, 2 * 365 days));
        uint256 id = _create();
        vm.prank(carol);
        funds.contribute(id, address(tsla), amount);
        vm.warp(block.timestamp + elapsed);

        vm.prank(bob);
        if (block.timestamp < unlockAt) {
            vm.expectRevert(HoldsakeFunds.Locked.selector);
            funds.withdraw(id, bob);
        } else {
            funds.withdraw(id, bob);
            assertEq(tsla.balanceOf(address(funds)), 0);
        }
    }
}
