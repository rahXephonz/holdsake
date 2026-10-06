// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {BasePaymaster} from "account-abstraction/core/BasePaymaster.sol";
import {_packValidationData} from "account-abstraction/core/Helpers.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title HoldsakePaymaster
/// @notice Pays gas for user operations the Holdsake server has signed for: one signature covers
/// one exact operation (sender, nonce, calldata, gas limits and fees), on this chain, through this
/// paymaster, within a short time window. Users pay us back in USDG inside the same batch.
/// @dev EntryPoint v0.8. `signer` and `maxCostPerOp` are immutable because ERC-7562 doesn't let an
/// unstaked paymaster read its own storage during validation; rotating the signer means deploying
/// a new paymaster and moving the deposit (owner `withdrawTo`, then `deposit` on the new one).
/// The owner (a multisig) can only manage this contract's own ETH deposit and stake; it never
/// touches user funds.
///
/// A sponsored operation whose execution reverts still costs us its gas. The server limits that
/// (simulate before submit, per-user rate limits, a failed-op counter); see AGENT.md "Paymaster".
contract HoldsakePaymaster is BasePaymaster {
    uint256 private constant VALIDITY_OFFSET = PAYMASTER_DATA_OFFSET;
    uint256 private constant SIGNATURE_OFFSET = VALIDITY_OFFSET + 12;

    /// Address of the server's sponsorship key. Holds no funds.
    address public immutable signer;
    /// Most an operation may cost us (EntryPoint's `maxCost`, in wei). Per-flow gas caps are
    /// enforced by the server before it signs; this is the backstop.
    uint256 public immutable maxCostPerOp;

    error ZeroAddress();
    error InvalidPaymasterData();
    error CostTooHigh(uint256 maxCost, uint256 cap);

    constructor(IEntryPoint entryPoint_, address owner_, address signer_, uint256 maxCostPerOp_)
        BasePaymaster(entryPoint_)
    {
        if (owner_ == address(0) || signer_ == address(0)) revert ZeroAddress();
        _transferOwnership(owner_);
        signer = signer_;
        maxCostPerOp = maxCostPerOp_;
    }

    /// @notice What the server signs (as an EIP-191 personal message) to sponsor `userOp`.
    /// Covers every field of the operation except its own signature and the paymaster signature.
    function getHash(PackedUserOperation calldata userOp, uint48 validUntil, uint48 validAfter)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.accountGasLimits,
                uint256(
                    bytes32(
                        userOp.paymasterAndData[PAYMASTER_VALIDATION_GAS_OFFSET:PAYMASTER_DATA_OFFSET

                        ]
                    )
                ),
                userOp.preVerificationGas,
                userOp.gasFees,
                block.chainid,
                address(this),
                validUntil,
                validAfter
            )
        );
    }

    /// @notice Splits `paymasterAndData` after the static fields:
    /// `validUntil (6 bytes) | validAfter (6 bytes) | signature (64 or 65 bytes)`.
    function parsePaymasterAndData(bytes calldata paymasterAndData)
        public
        pure
        returns (uint48 validUntil, uint48 validAfter, bytes calldata signature)
    {
        if (paymasterAndData.length < SIGNATURE_OFFSET + 64) revert InvalidPaymasterData();
        validUntil = uint48(bytes6(paymasterAndData[VALIDITY_OFFSET:VALIDITY_OFFSET + 6]));
        validAfter = uint48(bytes6(paymasterAndData[VALIDITY_OFFSET + 6:SIGNATURE_OFFSET]));
        signature = paymasterAndData[SIGNATURE_OFFSET:];
    }

    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32, /* userOpHash */
        uint256 maxCost
    ) internal view override returns (bytes memory context, uint256 validationData) {
        if (maxCost > maxCostPerOp) revert CostTooHigh(maxCost, maxCostPerOp);

        (uint48 validUntil, uint48 validAfter, bytes calldata signature) =
            parsePaymasterAndData(userOp.paymasterAndData);
        bytes32 digest =
            MessageHashUtils.toEthSignedMessageHash(getHash(userOp, validUntil, validAfter));
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        bool failed = err != ECDSA.RecoverError.NoError || recovered != signer;

        // Expiry is enforced by the EntryPoint from the packed validity window.
        return ("", _packValidationData(failed, validUntil, validAfter));
    }
}
