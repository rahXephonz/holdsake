// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {HoldsakeGifts} from "../src/HoldsakeGifts.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";
import {BaseTest} from "./Base.t.sol";

contract HoldsakeGiftsTest is BaseTest {
    HoldsakeGifts internal gifts;

    function setUp() public override {
        super.setUp();
        gifts = new HoldsakeGifts(tokenList, address(usdg));
        address[3] memory people = [alice, bob, carol];
        for (uint256 i; i < people.length; ++i) {
            vm.startPrank(people[i]);
            usdg.approve(address(gifts), type(uint256).max);
            tsla.approve(address(gifts), type(uint256).max);
            aapl.approve(address(gifts), type(uint256).max);
            nvda.approve(address(gifts), type(uint256).max);
            amzn.approve(address(gifts), type(uint256).max);
            feeToken.approve(address(gifts), type(uint256).max);
            unlisted.approve(address(gifts), type(uint256).max);
            vm.stopPrank();
        }
    }

    // --- helpers -----------------------------------------------------------------------------

    function _one(address token, uint256 amount)
        internal
        pure
        returns (HoldsakeGifts.ItemInput[] memory items)
    {
        items = new HoldsakeGifts.ItemInput[](1);
        items[0] = HoldsakeGifts.ItemInput(token, amount);
    }

    function _two(address a, uint256 amountA, address b, uint256 amountB)
        internal
        pure
        returns (HoldsakeGifts.ItemInput[] memory items)
    {
        items = new HoldsakeGifts.ItemInput[](2);
        items[0] = HoldsakeGifts.ItemInput(a, amountA);
        items[1] = HoldsakeGifts.ItemInput(b, amountB);
    }

    function _giftTslaAndCash() internal returns (uint256 id) {
        vm.prank(alice);
        id = gifts.createGift(bob, _two(address(tsla), 2e18, address(usdg), 25e18));
    }

    // --- create ------------------------------------------------------------------------------

    function test_create_locksItemsAndSetsExpiry() public {
        uint256 aliceTsla = tsla.balanceOf(alice);
        uint256 id = _giftTslaAndCash();

        (HoldsakeGifts.Gift memory gift, HoldsakeGifts.Item[] memory items) = gifts.getGift(id);
        assertEq(id, 1);
        assertEq(gift.sender, alice);
        assertEq(gift.recipient, bob);
        assertEq(gift.expiresAt, block.timestamp + 30 days);
        assertFalse(gift.opened);
        assertEq(items.length, 2);
        assertEq(items[0].token, address(tsla));
        assertEq(items[0].amount, 2e18);
        assertEq(tsla.balanceOf(address(gifts)), 2e18);
        assertEq(tsla.balanceOf(alice), aliceTsla - 2e18);
        assertEq(gifts.owed(address(tsla)), 2e18);
        assertEq(gifts.owed(address(usdg)), 25e18);
    }

    function test_create_emitsEvent() public {
        address[] memory tokens = new address[](1);
        tokens[0] = address(tsla);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1e18;
        vm.expectEmit(address(gifts));
        emit HoldsakeGifts.GiftCreated(
            1, alice, bob, uint64(block.timestamp + 30 days), tokens, amounts
        );
        vm.prank(alice);
        gifts.createGift(bob, _one(address(tsla), 1e18));
    }

    function test_create_threeStocksPlusCash() public {
        HoldsakeGifts.ItemInput[] memory items = new HoldsakeGifts.ItemInput[](4);
        items[0] = HoldsakeGifts.ItemInput(address(tsla), 1e18);
        items[1] = HoldsakeGifts.ItemInput(address(aapl), 1e18);
        items[2] = HoldsakeGifts.ItemInput(address(nvda), 1e18);
        items[3] = HoldsakeGifts.ItemInput(address(usdg), 1e18);
        vm.prank(alice);
        gifts.createGift(bob, items);
    }

    function test_create_rejectsFourStocks() public {
        HoldsakeGifts.ItemInput[] memory items = new HoldsakeGifts.ItemInput[](4);
        items[0] = HoldsakeGifts.ItemInput(address(tsla), 1e18);
        items[1] = HoldsakeGifts.ItemInput(address(aapl), 1e18);
        items[2] = HoldsakeGifts.ItemInput(address(nvda), 1e18);
        items[3] = HoldsakeGifts.ItemInput(address(amzn), 1e18);
        vm.prank(alice);
        vm.expectRevert(HoldsakeGifts.TooManyStocks.selector);
        gifts.createGift(bob, items);
    }

    function test_create_rejectsDuplicateToken() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(HoldsakeGifts.DuplicateToken.selector, address(tsla))
        );
        gifts.createGift(bob, _two(address(tsla), 1e18, address(tsla), 1e18));
    }

    function test_create_rejectsUnlistedToken() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(HoldsakeGifts.TokenNotAllowed.selector, address(unlisted))
        );
        gifts.createGift(bob, _one(address(unlisted), 1e18));
    }

    function test_create_rejectsBadInput() public {
        vm.startPrank(alice);
        vm.expectRevert(HoldsakeGifts.InvalidRecipient.selector);
        gifts.createGift(address(0), _one(address(tsla), 1e18));
        vm.expectRevert(HoldsakeGifts.InvalidRecipient.selector);
        gifts.createGift(alice, _one(address(tsla), 1e18));
        vm.expectRevert(HoldsakeGifts.NoItems.selector);
        gifts.createGift(bob, new HoldsakeGifts.ItemInput[](0));
        vm.expectRevert(HoldsakeGifts.ZeroAmount.selector);
        gifts.createGift(bob, _one(address(tsla), 0));
        vm.stopPrank();
    }

    function test_create_creditsWhatArrived() public {
        vm.prank(alice);
        uint256 id = gifts.createGift(bob, _one(address(feeToken), 100e18));
        (, HoldsakeGifts.Item[] memory items) = gifts.getGift(id);
        assertEq(items[0].amount, 99e18);
        assertEq(gifts.owed(address(feeToken)), 99e18);
    }

    // --- claim -------------------------------------------------------------------------------

    function test_claim_paysRecipientChosenAddress() public {
        uint256 id = _giftTslaAndCash();
        uint256 before = tsla.balanceOf(carol);
        vm.prank(bob);
        gifts.claimGift(id, carol);
        assertEq(tsla.balanceOf(carol), before + 2e18);
        assertEq(gifts.owed(address(tsla)), 0);
        assertEq(tsla.balanceOf(address(gifts)), 0);
        (HoldsakeGifts.Gift memory gift, HoldsakeGifts.Item[] memory items) = gifts.getGift(id);
        assertTrue(gift.opened);
        assertTrue(items[0].settled && items[1].settled);
    }

    function test_claim_onlyRecipient() public {
        uint256 id = _giftTslaAndCash();
        vm.prank(stranger);
        vm.expectRevert(HoldsakeGifts.NotRecipient.selector);
        gifts.claimGift(id, stranger);
        vm.prank(alice);
        vm.expectRevert(HoldsakeGifts.NotRecipient.selector);
        gifts.claimGift(id, alice);
    }

    function test_claim_boundary_lastSecondOkThenExpired() public {
        uint256 id = _giftTslaAndCash();
        (HoldsakeGifts.Gift memory gift,) = gifts.getGift(id);

        uint256 snap = vm.snapshotState();
        vm.warp(gift.expiresAt - 1);
        vm.prank(bob);
        gifts.claimGift(id, bob);

        vm.revertToState(snap);
        vm.warp(gift.expiresAt);
        vm.prank(bob);
        vm.expectRevert(HoldsakeGifts.Expired.selector);
        gifts.claimGift(id, bob);
    }

    function test_claim_twiceReverts() public {
        uint256 id = _giftTslaAndCash();
        vm.startPrank(bob);
        gifts.claimGift(id, bob);
        vm.expectRevert(abi.encodeWithSelector(HoldsakeGifts.NothingToSettle.selector, id));
        gifts.claimGift(id, bob);
        vm.expectRevert(abi.encodeWithSelector(HoldsakeGifts.AlreadySettled.selector, id, 0));
        gifts.claimItem(id, 0, bob);
        vm.stopPrank();
    }

    function test_claim_unknownGiftAndItem() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(HoldsakeGifts.UnknownGift.selector, 7));
        gifts.claimGift(7, bob);

        uint256 id = _giftTslaAndCash();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(HoldsakeGifts.UnknownItem.selector, id, 2));
        gifts.claimItem(id, 2, bob);
    }

    function test_claim_toZeroReverts() public {
        uint256 id = _giftTslaAndCash();
        vm.prank(bob);
        vm.expectRevert(HoldsakeGifts.ZeroAddress.selector);
        gifts.claimGift(id, address(0));
    }

    // --- refund ------------------------------------------------------------------------------

    function test_refund_senderBeforeOpen() public {
        uint256 before = tsla.balanceOf(alice);
        uint256 id = _giftTslaAndCash();
        vm.prank(alice);
        gifts.refundGift(id);
        assertEq(tsla.balanceOf(alice), before);
        assertEq(gifts.owed(address(tsla)), 0);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(HoldsakeGifts.NothingToSettle.selector, id));
        gifts.claimGift(id, bob);
    }

    function test_refund_senderCantTakeBackOnceOpened() public {
        uint256 id = _giftTslaAndCash();
        vm.prank(bob);
        gifts.claimItem(id, 0, bob);

        vm.startPrank(alice);
        vm.expectRevert(HoldsakeGifts.NotRefundable.selector);
        gifts.refundGift(id);
        vm.expectRevert(HoldsakeGifts.NotRefundable.selector);
        gifts.refundItem(id, 1);
        vm.stopPrank();
    }

    function test_refund_afterExpiryRemainderGoesBackEvenIfOpened() public {
        uint256 id = _giftTslaAndCash();
        vm.prank(bob);
        gifts.claimItem(id, 0, bob);

        vm.warp(block.timestamp + 30 days);
        uint256 before = usdg.balanceOf(alice);
        vm.prank(stranger);
        gifts.refundGift(id);
        assertEq(usdg.balanceOf(alice), before + 25e18);
    }

    function test_refund_strangerBoundary() public {
        uint256 id = _giftTslaAndCash();
        (HoldsakeGifts.Gift memory gift,) = gifts.getGift(id);

        vm.warp(gift.expiresAt - 1);
        vm.prank(stranger);
        vm.expectRevert(HoldsakeGifts.NotRefundable.selector);
        gifts.refundGift(id);

        vm.warp(gift.expiresAt);
        uint256 before = tsla.balanceOf(alice);
        vm.prank(stranger);
        gifts.refundGift(id);
        assertEq(tsla.balanceOf(alice), before + 2e18);
    }

    function test_refund_onlySenderPicksDestination() public {
        uint256 id = _giftTslaAndCash();
        vm.warp(block.timestamp + 30 days);
        vm.prank(stranger);
        vm.expectRevert(HoldsakeGifts.NotSender.selector);
        gifts.refundGiftTo(id, stranger);

        vm.prank(bob);
        vm.expectRevert(HoldsakeGifts.NotSender.selector);
        gifts.refundItemTo(id, 0, bob);
    }

    // --- stuck tokens ------------------------------------------------------------------------

    function test_pausedTokenDoesNotLockTheRest() public {
        uint256 id = _giftTslaAndCash();
        tsla.setPaused(true);

        vm.startPrank(bob);
        vm.expectRevert(MockStockToken.TokenPaused.selector);
        gifts.claimGift(id, bob);

        uint256 before = usdg.balanceOf(bob);
        gifts.claimItem(id, 1, bob);
        assertEq(usdg.balanceOf(bob), before + 25e18);

        tsla.setPaused(false);
        gifts.claimItem(id, 0, bob);
        vm.stopPrank();
        assertEq(tsla.balanceOf(address(gifts)), 0);
    }

    function test_blockedRecipientClaimsElsewhere() public {
        uint256 id = _giftTslaAndCash();
        tsla.setBlocked(bob, true);

        vm.startPrank(bob);
        vm.expectRevert(abi.encodeWithSelector(MockStockToken.AddressBlocked.selector, bob));
        gifts.claimGift(id, bob);
        gifts.claimGift(id, carol);
        vm.stopPrank();
    }

    function test_blockedSenderRefundsElsewhere() public {
        uint256 id = _giftTslaAndCash();
        vm.warp(block.timestamp + 30 days);
        tsla.setBlocked(alice, true);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MockStockToken.AddressBlocked.selector, alice));
        gifts.refundGift(id);

        uint256 before = tsla.balanceOf(carol);
        vm.prank(alice);
        gifts.refundGiftTo(id, carol);
        assertEq(tsla.balanceOf(carol), before + 2e18);
    }

    function test_multiplierChangeMidGiftPaysSameRawAmount() public {
        uint256 id = _giftTslaAndCash();
        tsla.setMultiplier(2e18); // a 2-for-1 split while the gift waits
        uint256 before = tsla.balanceOf(bob);
        vm.prank(bob);
        gifts.claimGift(id, bob);
        assertEq(tsla.balanceOf(bob), before + 2e18);
    }

    // --- fuzz --------------------------------------------------------------------------------

    function testFuzz_claimOrRefundByTime(uint96 amount, uint32 elapsed) public {
        amount = uint96(bound(amount, 1, 1_000_000e18));
        vm.prank(alice);
        uint256 id = gifts.createGift(bob, _one(address(aapl), amount));
        vm.warp(block.timestamp + elapsed);
        bool expired = elapsed >= 30 days;

        if (!expired) {
            vm.prank(stranger);
            vm.expectRevert(HoldsakeGifts.NotRefundable.selector);
            gifts.refundGift(id);
            vm.prank(bob);
            gifts.claimGift(id, bob);
        } else {
            vm.prank(bob);
            vm.expectRevert(HoldsakeGifts.Expired.selector);
            gifts.claimGift(id, bob);
            vm.prank(stranger);
            gifts.refundGift(id);
        }
        assertEq(aapl.balanceOf(address(gifts)), 0);
        assertEq(gifts.owed(address(aapl)), 0);
    }
}
