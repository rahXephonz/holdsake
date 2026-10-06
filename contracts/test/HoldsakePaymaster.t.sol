// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {BaseAccount} from "account-abstraction/core/BaseAccount.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {SimpleAccount} from "account-abstraction/accounts/SimpleAccount.sol";
import {SimpleAccountFactory} from "account-abstraction/accounts/SimpleAccountFactory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {HoldsakePaymaster} from "../src/HoldsakePaymaster.sol";
import {HoldsakeGifts} from "../src/HoldsakeGifts.sol";
import {BaseTest} from "./Base.t.sol";

contract HoldsakePaymasterTest is BaseTest {
    EntryPoint internal entryPoint;
    HoldsakePaymaster internal paymaster;
    HoldsakeGifts internal gifts;
    SimpleAccount internal account;

    uint256 internal ownerKey;
    uint256 internal signerKey;
    address internal treasury = makeAddr("treasury");
    address payable internal bundler = payable(makeAddr("bundler"));

    uint256 constant MAX_COST = 0.01 ether;
    uint256 constant FEE = 0.05e18; // USDG fee recorded on the draft

    function setUp() public override {
        super.setUp();
        entryPoint = new EntryPoint();
        address owner;
        (owner, ownerKey) = makeAddrAndKey("accountOwner");
        address signerAddr;
        (signerAddr, signerKey) = makeAddrAndKey("sponsorSigner");

        paymaster = new HoldsakePaymaster(entryPoint, multisig, signerAddr, MAX_COST);
        paymaster.deposit{value: 1 ether}();
        gifts = new HoldsakeGifts(tokenList, address(usdg));

        SimpleAccountFactory factory = new SimpleAccountFactory(entryPoint);
        vm.prank(address(entryPoint.senderCreator()));
        account = factory.createAccount(owner, 0);
        tsla.mint(address(account), 10e18);
        usdg.mint(address(account), 100e18);
    }

    // --- helpers -----------------------------------------------------------------------------

    function _giftBatch() internal view returns (bytes memory) {
        HoldsakeGifts.ItemInput[] memory items = new HoldsakeGifts.ItemInput[](1);
        items[0] = HoldsakeGifts.ItemInput(address(tsla), 1e18);
        BaseAccount.Call[] memory calls = new BaseAccount.Call[](3);
        calls[0] = BaseAccount.Call(
            address(tsla), 0, abi.encodeCall(IERC20.approve, (address(gifts), 1e18))
        );
        calls[1] = BaseAccount.Call(
            address(gifts), 0, abi.encodeCall(HoldsakeGifts.createGift, (bob, items))
        );
        calls[2] =
            BaseAccount.Call(address(usdg), 0, abi.encodeCall(IERC20.transfer, (treasury, FEE)));
        return abi.encodeCall(BaseAccount.executeBatch, (calls));
    }

    function _op(bytes memory callData) internal view returns (PackedUserOperation memory op) {
        op.sender = address(account);
        op.nonce = entryPoint.getNonce(address(account), 0);
        op.callData = callData;
        op.accountGasLimits = bytes32((uint256(300_000) << 128) | 600_000);
        op.preVerificationGas = 50_000;
        op.gasFees = bytes32((uint256(1 gwei) << 128) | 1 gwei);
    }

    function _sponsor(PackedUserOperation memory op, uint256 key, uint48 validUntil)
        internal
        view
        returns (PackedUserOperation memory)
    {
        uint48 validAfter = 0;
        // Static fields first (gas limits are covered by the sponsor's signature), then sign.
        op.paymasterAndData = abi.encodePacked(
            address(paymaster), uint128(100_000), uint128(0), validUntil, validAfter
        );
        bytes32 hash = paymaster.getHash(op, validUntil, validAfter);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(key, MessageHashUtils.toEthSignedMessageHash(hash));
        op.paymasterAndData = abi.encodePacked(op.paymasterAndData, r, s, v);
        return op;
    }

    function _signByAccount(PackedUserOperation memory op)
        internal
        view
        returns (PackedUserOperation memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, entryPoint.getUserOpHash(op));
        op.signature = abi.encodePacked(r, s, v);
        return op;
    }

    function _submit(PackedUserOperation memory op) internal {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        vm.prank(bundler, bundler);
        entryPoint.handleOps(ops, bundler);
    }

    function _sponsored(uint256 key, uint48 validUntil)
        internal
        view
        returns (PackedUserOperation memory)
    {
        return _signByAccount(_sponsor(_op(_giftBatch()), key, validUntil));
    }

    // --- tests -------------------------------------------------------------------------------

    function test_sponsoredGiftBatch() public {
        uint256 depositBefore = paymaster.getDeposit();
        _submit(_sponsored(signerKey, uint48(block.timestamp + 5 minutes)));

        (HoldsakeGifts.Gift memory gift,) = gifts.getGift(1);
        assertEq(gift.sender, address(account), "gift created from the account");
        assertEq(usdg.balanceOf(treasury), FEE, "fee paid in the same batch");
        assertEq(address(account).balance, 0, "user spent no ETH");
        assertLt(paymaster.getDeposit(), depositBefore, "paymaster paid the gas");
    }

    function test_rejectsWrongSigner() public {
        (, uint256 otherKey) = makeAddrAndKey("attacker");
        PackedUserOperation memory op = _sponsored(otherKey, uint48(block.timestamp + 5 minutes));
        vm.expectRevert(
            abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA34 signature error")
        );
        _submit(op);
    }

    function test_rejectsTamperedCalldata() public {
        PackedUserOperation memory op =
            _sponsor(_op(_giftBatch()), signerKey, uint48(block.timestamp + 5 minutes));
        // Same sponsorship, different calls: e.g. the fee transfer removed.
        BaseAccount.Call[] memory calls = new BaseAccount.Call[](1);
        calls[0] =
            BaseAccount.Call(address(tsla), 0, abi.encodeCall(IERC20.transfer, (stranger, 5e18)));
        op.callData = abi.encodeCall(BaseAccount.executeBatch, (calls));
        op = _signByAccount(op);
        vm.expectRevert(
            abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA34 signature error")
        );
        _submit(op);
    }

    function test_rejectsRaisedGasLimits() public {
        PackedUserOperation memory op =
            _sponsor(_op(_giftBatch()), signerKey, uint48(block.timestamp + 5 minutes));
        op.accountGasLimits = bytes32((uint256(300_000) << 128) | 900_000);
        op = _signByAccount(op);
        vm.expectRevert(
            abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA34 signature error")
        );
        _submit(op);
    }

    function test_rejectsExpiredSponsorship() public {
        PackedUserOperation memory op = _sponsored(signerKey, uint48(block.timestamp + 5 minutes));
        vm.warp(block.timestamp + 6 minutes);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOp.selector, 0, "AA32 paymaster expired or not due"
            )
        );
        _submit(op);
    }

    function test_sponsorshipIsSingleUse() public {
        PackedUserOperation memory op = _sponsored(signerKey, uint48(block.timestamp + 5 minutes));
        _submit(op);
        vm.expectRevert(
            abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA25 invalid account nonce")
        );
        _submit(op);
    }

    function test_rejectsCostAboveCap() public {
        PackedUserOperation memory op = _op(_giftBatch());
        op.gasFees = bytes32((uint256(100 gwei) << 128) | 100 gwei);
        op = _signByAccount(_sponsor(op, signerKey, uint48(block.timestamp + 5 minutes)));
        vm.expectPartialRevert(IEntryPoint.FailedOpWithRevert.selector);
        _submit(op);
    }

    /// The case the server has to guard against: execution reverts, so the USDG fee transfer
    /// reverts with it, but the paymaster has still paid for the gas.
    function test_revertedExecutionStillCostsUs() public {
        usdg.setBlocked(treasury, true); // make the fee transfer fail
        uint256 depositBefore = paymaster.getDeposit();
        _submit(_sponsored(signerKey, uint48(block.timestamp + 5 minutes)));

        assertEq(gifts.giftCount(), 0, "nothing happened");
        assertEq(usdg.balanceOf(treasury), 0, "no fee collected");
        assertLt(paymaster.getDeposit(), depositBefore, "but we paid gas");
    }

    function test_ownerIsMultisigAndManagesDepositOnly() public {
        assertEq(paymaster.owner(), multisig);
        vm.prank(stranger);
        vm.expectRevert();
        paymaster.withdrawTo(payable(stranger), 1);

        vm.prank(multisig);
        paymaster.withdrawTo(payable(multisig), 0.5 ether);
        assertEq(multisig.balance, 0.5 ether);
    }

    function test_constructorRejectsZero() public {
        vm.expectRevert(HoldsakePaymaster.ZeroAddress.selector);
        new HoldsakePaymaster(entryPoint, address(0), address(1), MAX_COST);
        vm.expectRevert(HoldsakePaymaster.ZeroAddress.selector);
        new HoldsakePaymaster(entryPoint, multisig, address(0), MAX_COST);
    }

    function test_parseRejectsShortData() public {
        vm.expectRevert(HoldsakePaymaster.InvalidPaymasterData.selector);
        paymaster.parsePaymasterAndData(abi.encodePacked(address(paymaster), uint256(0)));
    }
}
