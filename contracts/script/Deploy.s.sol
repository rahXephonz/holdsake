// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {HoldsakeTokenList} from "../src/HoldsakeTokenList.sol";
import {HoldsakeGifts} from "../src/HoldsakeGifts.sol";
import {HoldsakeFunds} from "../src/HoldsakeFunds.sol";
import {HoldsakePaymaster} from "../src/HoldsakePaymaster.sol";

/// Deploys the token list, gifts, funds and the paymaster. Does not fund the paymaster: that's a
/// separate, explicit step.
///
/// SPENDS ETH ON MAINNET. Never run with --broadcast without the user's go-ahead, never from
/// moon or CI. Dry run first (no --broadcast) against a fork:
///
///   forge script script/Deploy.s.sol --fork-url $ROBINHOOD_RPC_URL
///
/// Env:
///   OWNER_MULTISIG       multisig that owns the token list and the paymaster (never an EOA)
///   USDG                 cash token, canonical address from Robinhood's docs
///   INITIAL_TOKENS       comma-separated canonical Stock Token addresses from Robinhood's registry
///   PAYMASTER_SIGNER     address of the server's sponsorship key (PAYMASTER_SIGNER_KEY)
///   PAYMASTER_MAX_COST   most one sponsored operation may cost, in wei
contract Deploy is Script {
    /// EntryPoint v0.8, as served by the chain's bundler (eth_supportedEntryPoints).
    IEntryPoint constant ENTRY_POINT = IEntryPoint(0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108);

    function run()
        external
        returns (
            HoldsakeTokenList tokenList,
            HoldsakeGifts gifts,
            HoldsakeFunds funds,
            HoldsakePaymaster paymaster
        )
    {
        address owner = vm.envAddress("OWNER_MULTISIG");
        address usdg = vm.envAddress("USDG");
        address[] memory stocks = vm.envAddress("INITIAL_TOKENS", ",");
        address sponsor = vm.envAddress("PAYMASTER_SIGNER");
        uint256 maxCost = vm.envUint("PAYMASTER_MAX_COST");
        require(owner.code.length > 0, "OWNER_MULTISIG must be a multisig contract");
        require(address(ENTRY_POINT).code.length > 0, "EntryPoint v0.8 missing on this chain");

        address[] memory initial = new address[](stocks.length + 1);
        initial[0] = usdg;
        for (uint256 i; i < stocks.length; ++i) {
            initial[i + 1] = stocks[i];
        }

        vm.startBroadcast();
        tokenList = new HoldsakeTokenList(owner, initial);
        gifts = new HoldsakeGifts(tokenList, usdg);
        funds = new HoldsakeFunds(tokenList);
        paymaster = new HoldsakePaymaster(ENTRY_POINT, owner, sponsor, maxCost);
        vm.stopBroadcast();

        console.log("HoldsakeTokenList", address(tokenList));
        console.log("HoldsakeGifts", address(gifts));
        console.log("HoldsakeFunds", address(funds));
        console.log("HoldsakePaymaster", address(paymaster));
    }
}
