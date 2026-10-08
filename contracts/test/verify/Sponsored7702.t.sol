// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {BaseAccount} from "account-abstraction/core/BaseAccount.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {HoldsakeTokenList} from "../../src/HoldsakeTokenList.sol";
import {HoldsakeGifts} from "../../src/HoldsakeGifts.sol";
import {HoldsakePaymaster} from "../../src/HoldsakePaymaster.sol";

/// "Verify first" step 8, end to end on a Robinhood Chain fork: a fresh EOA with no ETH delegates
/// to the official Simple7702Account (EIP-7702), and one sponsored user operation through the
/// deployed EntryPoint v0.8 approves TSLA, creates a gift and pays the USDG fee.
contract Sponsored7702Test is Test {
    IEntryPoint constant ENTRY_POINT = IEntryPoint(0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108);
    address constant SIMPLE_7702_ACCOUNT = 0xe6Cae83BdE06E4c305530e199D7217f42808555B;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant TSLA = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;

    HoldsakeGifts gifts;
    HoldsakePaymaster paymaster;
    address user;
    uint256 userKey;
    uint256 signerKey;
    address treasury = makeAddr("treasury");
    address recipient = makeAddr("recipient");
    address payable bundler = payable(makeAddr("bundler"));

    function setUp() public {
        require(block.chainid == 4663, "run against a Robinhood Chain fork");
        (user, userKey) = makeAddrAndKey("user");
        address signer;
        (signer, signerKey) = makeAddrAndKey("sponsor");

        address[] memory initial = new address[](2);
        initial[0] = USDG;
        initial[1] = TSLA;
        gifts = new HoldsakeGifts(new HoldsakeTokenList(address(this), initial), USDG);
        paymaster = new HoldsakePaymaster(ENTRY_POINT, address(this), signer, 0.001 ether);
        vm.deal(address(this), 1 ether);
        paymaster.deposit{value: 0.01 ether}();

        address tslaHolder =
            vm.envOr("VERIFY_HOLDER", address(0x92d435C96E63c43E12d6D0AB28f6b0B04072F765));
        address usdgHolder =
            vm.envOr("VERIFY_USDG_HOLDER", address(0xf70da97812CB96acDF810712Aa562db8dfA3dbEF));
        vm.prank(tslaHolder);
        IERC20(TSLA).transfer(user, 1e18);
        vm.prank(usdgHolder);
        IERC20(USDG).transfer(user, 10e6);

        vm.signAndAttachDelegation(SIMPLE_7702_ACCOUNT, userKey);
        require(user.code.length > 0, "delegation attached");
    }

    function test_sponsoredGift_via7702() public {
        HoldsakeGifts.ItemInput[] memory items = new HoldsakeGifts.ItemInput[](1);
        items[0] = HoldsakeGifts.ItemInput(TSLA, 1e18);
        BaseAccount.Call[] memory calls = new BaseAccount.Call[](3);
        calls[0] = BaseAccount.Call(TSLA, 0, abi.encodeCall(IERC20.approve, (address(gifts), 1e18)));
        calls[1] = BaseAccount.Call(
            address(gifts), 0, abi.encodeCall(HoldsakeGifts.createGift, (recipient, items))
        );
        calls[2] = BaseAccount.Call(USDG, 0, abi.encodeCall(IERC20.transfer, (treasury, 0.02e6)));

        PackedUserOperation memory op;
        op.sender = user;
        op.nonce = ENTRY_POINT.getNonce(user, 0);
        op.callData = abi.encodeCall(BaseAccount.executeBatch, (calls));
        op.accountGasLimits = bytes32((uint256(150_000) << 128) | 600_000);
        op.preVerificationGas = 60_000;
        uint256 fee = block.basefee * 2 + 1;
        op.gasFees = bytes32((uint256(fee) << 128) | fee);

        uint48 validUntil = uint48(block.timestamp + 5 minutes);
        op.paymasterAndData = abi.encodePacked(
            address(paymaster), uint128(60_000), uint128(0), validUntil, uint48(0)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            signerKey, MessageHashUtils.toEthSignedMessageHash(paymaster.getHash(op, validUntil, 0))
        );
        op.paymasterAndData = abi.encodePacked(op.paymasterAndData, r, s, v);
        (v, r, s) = vm.sign(userKey, ENTRY_POINT.getUserOpHash(op));
        op.signature = abi.encodePacked(r, s, v);

        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        uint256 depositBefore = paymaster.getDeposit();
        vm.prank(bundler, bundler);
        ENTRY_POINT.handleOps(ops, bundler);

        (HoldsakeGifts.Gift memory gift,) = gifts.getGift(1);
        assertEq(gift.sender, user);
        assertEq(IERC20(TSLA).balanceOf(address(gifts)), 1e18);
        assertEq(IERC20(USDG).balanceOf(treasury), 0.02e6);
        assertEq(user.balance, 0, "user never held ETH");
        console.log("paymaster paid (wei)", depositBefore - paymaster.getDeposit());
        console.log("basefee (wei)", block.basefee);
    }
}
