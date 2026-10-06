// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {HoldsakeGifts} from "../../src/HoldsakeGifts.sol";
import {HoldsakeFunds} from "../../src/HoldsakeFunds.sol";
import {MockStockToken, MockFeeToken} from "../mocks/MockStockToken.sol";
import {BaseTest} from "../Base.t.sol";

/// Drives random creates, claims, refunds, contributions, withdrawals, pauses and time jumps.
/// Calls that revert are expected (wrong caller, too early, paused); the invariants must hold
/// whatever happens.
contract EscrowHandler is Test {
    HoldsakeGifts internal gifts;
    HoldsakeFunds internal funds;
    address[] internal tokens;
    address[] internal actors;

    constructor(
        HoldsakeGifts gifts_,
        HoldsakeFunds funds_,
        address[] memory tokens_,
        address[] memory actors_
    ) {
        gifts = gifts_;
        funds = funds_;
        tokens = tokens_;
        actors = actors_;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _token(uint256 seed) internal view returns (address) {
        return tokens[seed % tokens.length];
    }

    function createGift(uint256 fromSeed, uint256 toSeed, uint256 tokenSeed, uint256 amount)
        external
    {
        address from = _actor(fromSeed);
        address to = _actor(toSeed);
        HoldsakeGifts.ItemInput[] memory items = new HoldsakeGifts.ItemInput[](1);
        items[0] = HoldsakeGifts.ItemInput(_token(tokenSeed), bound(amount, 1, 1000e18));
        vm.prank(from);
        try gifts.createGift(to, items) {} catch {}
    }

    function claimItem(uint256 idSeed, uint256 actorSeed, uint256 index) external {
        uint256 count = gifts.giftCount();
        if (count == 0) return;
        address actor = _actor(actorSeed);
        vm.prank(actor);
        try gifts.claimItem(1 + idSeed % count, index % 2, actor) {} catch {}
    }

    function refundGift(uint256 idSeed, uint256 actorSeed) external {
        uint256 count = gifts.giftCount();
        if (count == 0) return;
        vm.prank(_actor(actorSeed));
        try gifts.refundGift(1 + idSeed % count) {} catch {}
    }

    function createFund(uint256 fromSeed, uint256 toSeed, uint256 tokenSeed, uint256 lock)
        external
    {
        HoldsakeFunds.MixEntry[] memory mix = new HoldsakeFunds.MixEntry[](1);
        mix[0] = HoldsakeFunds.MixEntry(_token(tokenSeed), 1e15);
        vm.prank(_actor(fromSeed));
        try funds.createFund(
            _actor(toSeed), uint64(block.timestamp + bound(lock, 1, 90 days)), mix
        ) {}
            catch {}
    }

    function contribute(uint256 idSeed, uint256 actorSeed, uint256 tokenSeed, uint256 amount)
        external
    {
        uint256 count = funds.fundCount();
        if (count == 0) return;
        vm.prank(_actor(actorSeed));
        try funds.contribute(1 + idSeed % count, _token(tokenSeed), bound(amount, 1, 1000e18)) {}
            catch {}
    }

    function withdraw(uint256 idSeed, uint256 actorSeed) external {
        uint256 count = funds.fundCount();
        if (count == 0) return;
        address actor = _actor(actorSeed);
        vm.prank(actor);
        try funds.withdraw(1 + idSeed % count, actor) {} catch {}
    }

    function togglePause(uint256 tokenSeed) external {
        MockStockToken token = MockStockToken(_token(tokenSeed));
        try token.paused() returns (bool paused) {
            token.setPaused(!paused);
        } catch {} // the fee token has no pause switch
    }

    function warp(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 1, 20 days));
    }
}

contract EscrowInvariantTest is BaseTest {
    HoldsakeGifts internal gifts;
    HoldsakeFunds internal funds;
    EscrowHandler internal handler;
    address[] internal tracked;

    function setUp() public override {
        super.setUp();
        gifts = new HoldsakeGifts(tokenList, address(usdg));
        funds = new HoldsakeFunds(tokenList);

        tracked.push(address(usdg));
        tracked.push(address(tsla));
        tracked.push(address(aapl));
        tracked.push(address(feeToken));

        address[] memory actors = new address[](3);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;
        for (uint256 a; a < actors.length; ++a) {
            vm.startPrank(actors[a]);
            for (uint256 t; t < tracked.length; ++t) {
                MockStockToken(tracked[t]).approve(address(gifts), type(uint256).max);
                MockStockToken(tracked[t]).approve(address(funds), type(uint256).max);
            }
            vm.stopPrank();
        }

        handler = new EscrowHandler(gifts, funds, tracked, actors);
        targetContract(address(handler));
    }

    /// For every token, each contract holds at least everything it owes.
    function invariant_balanceCoversOwed() public view {
        for (uint256 t; t < tracked.length; ++t) {
            address token = tracked[t];
            assertGe(MockFeeToken(token).balanceOf(address(gifts)), gifts.owed(token), "gifts");
            assertGe(MockFeeToken(token).balanceOf(address(funds)), funds.owed(token), "funds");
        }
    }

    /// Gifts: `owed` equals the sum of unsettled items, so no item is counted twice or lost.
    function invariant_giftsOwedMatchesOpenItems() public view {
        uint256[] memory sums = new uint256[](tracked.length);
        uint256 count = gifts.giftCount();
        for (uint256 id = 1; id <= count; ++id) {
            (, HoldsakeGifts.Item[] memory items) = gifts.getGift(id);
            for (uint256 i; i < items.length; ++i) {
                if (items[i].settled) continue;
                for (uint256 t; t < tracked.length; ++t) {
                    if (items[i].token == tracked[t]) sums[t] += items[i].amount;
                }
            }
        }
        for (uint256 t; t < tracked.length; ++t) {
            assertEq(gifts.owed(tracked[t]), sums[t]);
        }
    }

    /// Funds: `owed` equals the sum of every fund's balance.
    function invariant_fundsOwedMatchesBalances() public view {
        uint256[] memory sums = new uint256[](tracked.length);
        uint256 count = funds.fundCount();
        for (uint256 id = 1; id <= count; ++id) {
            for (uint256 t; t < tracked.length; ++t) {
                sums[t] += funds.balanceOf(id, tracked[t]);
            }
        }
        for (uint256 t; t < tracked.length; ++t) {
            assertEq(funds.owed(tracked[t]), sums[t]);
        }
    }
}
