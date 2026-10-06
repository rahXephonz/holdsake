// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {HoldsakeTokenList} from "../../src/HoldsakeTokenList.sol";
import {HoldsakeGifts} from "../../src/HoldsakeGifts.sol";
import {HoldsakeFunds} from "../../src/HoldsakeFunds.sol";

interface IStockToken {
    function ACCESS_CONTROLLED_REGISTRY() external view returns (address);
    function uiMultiplier() external view returns (uint256);
}

interface IAccessRegistry {
    function isBlocked(address account) external view returns (bool);
}

/// "Verify first" against the real Robinhood Stock Token and USDG on a Robinhood Chain fork.
/// Run with `moon run contracts:verify`. Holders default to addresses seen holding each token at
/// the time of writing; override with VERIFY_HOLDER / VERIFY_USDG_HOLDER if they move.
contract RealTokensTest is Test {
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant TSLA = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;

    HoldsakeTokenList tokenList;
    HoldsakeGifts gifts;
    HoldsakeFunds funds;
    address tslaHolder;
    address usdgHolder;
    address registry;

    address recipient = makeAddr("recipient");
    address elsewhere = makeAddr("elsewhere");
    address stranger = makeAddr("stranger");

    uint256 constant TSLA_AMOUNT = 1e18; // one share
    uint256 constant USDG_AMOUNT = 25e6; // $25, USDG has 6 decimals

    function setUp() public {
        require(block.chainid == 4663, "run against a Robinhood Chain fork");
        tslaHolder = vm.envOr("VERIFY_HOLDER", address(0x92d435C96E63c43E12d6D0AB28f6b0B04072F765));
        usdgHolder =
            vm.envOr("VERIFY_USDG_HOLDER", address(0xf70da97812CB96acDF810712Aa562db8dfA3dbEF));
        registry = IStockToken(TSLA).ACCESS_CONTROLLED_REGISTRY();

        address[] memory initial = new address[](2);
        initial[0] = USDG;
        initial[1] = TSLA;
        tokenList = new HoldsakeTokenList(address(this), initial);
        gifts = new HoldsakeGifts(tokenList, USDG);
        funds = new HoldsakeFunds(tokenList);

        vm.prank(usdgHolder);
        IERC20(USDG).transfer(tslaHolder, 1000e6);
        vm.startPrank(tslaHolder);
        IERC20(TSLA).approve(address(gifts), type(uint256).max);
        IERC20(USDG).approve(address(gifts), type(uint256).max);
        IERC20(TSLA).approve(address(funds), type(uint256).max);
        vm.stopPrank();
    }

    function _items() internal pure returns (HoldsakeGifts.ItemInput[] memory items) {
        items = new HoldsakeGifts.ItemInput[](2);
        items[0] = HoldsakeGifts.ItemInput(TSLA, TSLA_AMOUNT);
        items[1] = HoldsakeGifts.ItemInput(USDG, USDG_AMOUNT);
    }

    function _create() internal returns (uint256 id) {
        vm.prank(tslaHolder);
        id = gifts.createGift(recipient, _items());
    }

    function test_facts() public view {
        console.log("USDG decimals", uint256(IERC20Metadata(USDG).decimals()));
        console.log("TSLA decimals", uint256(IERC20Metadata(TSLA).decimals()));
        console.log("TSLA uiMultiplier", IStockToken(TSLA).uiMultiplier());
        console.log("TSLA registry", registry);
        assertEq(IERC20Metadata(USDG).decimals(), 6);
        assertEq(IERC20Metadata(TSLA).decimals(), 18);
    }

    function test_gift_createClaim_realTokens() public {
        uint256 g0 = gasleft();
        uint256 id = _create();
        uint256 createGas = g0 - gasleft();

        (, HoldsakeGifts.Item[] memory items) = gifts.getGift(id);
        assertEq(items[0].amount, TSLA_AMOUNT, "TSLA arrives in full");
        assertEq(items[1].amount, USDG_AMOUNT, "USDG arrives in full");

        g0 = gasleft();
        vm.prank(recipient);
        gifts.claimGift(id, recipient);
        uint256 claimGas = g0 - gasleft();

        assertEq(IERC20(TSLA).balanceOf(recipient), TSLA_AMOUNT);
        assertEq(IERC20(USDG).balanceOf(recipient), USDG_AMOUNT);
        console.log("gas createGift TSLA+USDG", createGas);
        console.log("gas claimGift 2 items", claimGas);
    }

    function test_gift_expireRefund_realTokens() public {
        uint256 before = IERC20(TSLA).balanceOf(tslaHolder);
        uint256 id = _create();
        vm.warp(block.timestamp + 30 days);
        uint256 g0 = gasleft();
        vm.prank(stranger);
        gifts.refundGift(id);
        console.log("gas refundGift 2 items", g0 - gasleft());
        assertEq(IERC20(TSLA).balanceOf(tslaHolder), before);
    }

    function test_fund_contributeWithdraw_realTokens() public {
        HoldsakeFunds.MixEntry[] memory mix = new HoldsakeFunds.MixEntry[](1);
        mix[0] = HoldsakeFunds.MixEntry(TSLA, 1e15);
        uint64 unlockAt = uint64(block.timestamp + 365 days);

        uint256 g0 = gasleft();
        vm.prank(tslaHolder);
        uint256 id = funds.createFund(recipient, unlockAt, mix);
        console.log("gas createFund 1 stock", g0 - gasleft());

        g0 = gasleft();
        vm.prank(tslaHolder);
        funds.contribute(id, TSLA, TSLA_AMOUNT);
        console.log("gas contribute", g0 - gasleft());

        vm.warp(unlockAt);
        g0 = gasleft();
        vm.prank(recipient);
        funds.withdraw(id, recipient);
        console.log("gas withdraw 1 stock", g0 - gasleft());
        assertEq(IERC20(TSLA).balanceOf(recipient), TSLA_AMOUNT);
    }

    /// Step 6: what the blocklist blocks. Mocks the registry's answer for one address.
    function test_blocklist_whatReverts() public {
        vm.mockCall(
            registry, abi.encodeCall(IAccessRegistry.isBlocked, (recipient)), abi.encode(true)
        );

        // Sending to a blocked address
        vm.prank(tslaHolder);
        (bool sendTo,) = TSLA.call(abi.encodeCall(IERC20.transfer, (recipient, 1)));
        // Approving a blocked spender
        vm.prank(tslaHolder);
        (bool approveTo,) = TSLA.call(abi.encodeCall(IERC20.approve, (recipient, 1)));
        console.log("transfer to blocked ok?", sendTo);
        console.log("approve blocked spender ok?", approveTo);

        // Sending from a blocked address: give it a share first, then block.
        vm.clearMockedCalls();
        vm.prank(tslaHolder);
        IERC20(TSLA).transfer(recipient, 1);
        vm.mockCall(
            registry, abi.encodeCall(IAccessRegistry.isBlocked, (recipient)), abi.encode(true)
        );
        vm.prank(recipient);
        (bool sendFrom,) = TSLA.call(abi.encodeCall(IERC20.transfer, (stranger, 1)));
        console.log("transfer from blocked ok?", sendFrom);
    }

    /// A blocked recipient still opens the gift, to another address they control.
    function test_blocklist_recipientClaimsElsewhere() public {
        uint256 id = _create();
        vm.mockCall(
            registry, abi.encodeCall(IAccessRegistry.isBlocked, (recipient)), abi.encode(true)
        );
        vm.prank(recipient);
        vm.expectRevert();
        gifts.claimItem(id, 0, recipient);

        vm.prank(recipient);
        gifts.claimGift(id, elsewhere);
        assertEq(IERC20(TSLA).balanceOf(elsewhere), TSLA_AMOUNT);
    }

    /// If Robinhood blocks our escrow contract itself, nothing in it can move. Not fixable in our
    /// contracts; recorded so the risk is known.
    function test_blocklist_blockedEscrowFreezesEverything() public {
        uint256 id = _create();
        vm.mockCall(
            registry, abi.encodeCall(IAccessRegistry.isBlocked, (address(gifts))), abi.encode(true)
        );
        vm.prank(recipient);
        vm.expectRevert();
        gifts.claimItem(id, 0, recipient);
    }

    /// Step 3: permit works, so one signature replaces a separate approve.
    function test_permit_realToken() public {
        (address signer, uint256 pk) = makeAddrAndKey("signer");
        vm.prank(tslaHolder);
        IERC20(TSLA).transfer(signer, TSLA_AMOUNT);

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                signer,
                address(gifts),
                TSLA_AMOUNT,
                IERC20Permit(TSLA).nonces(signer),
                deadline
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", IERC20Permit(TSLA).DOMAIN_SEPARATOR(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        IERC20Permit(TSLA).permit(signer, address(gifts), TSLA_AMOUNT, deadline, v, r, s);
        assertEq(IERC20(TSLA).allowance(signer, address(gifts)), TSLA_AMOUNT);

        HoldsakeGifts.ItemInput[] memory items = new HoldsakeGifts.ItemInput[](1);
        items[0] = HoldsakeGifts.ItemInput(TSLA, TSLA_AMOUNT);
        vm.prank(signer);
        gifts.createGift(recipient, items);
    }
}

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}
