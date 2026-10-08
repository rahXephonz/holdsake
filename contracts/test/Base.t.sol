// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {HoldsakeTokenList} from "../src/HoldsakeTokenList.sol";
import {MockStockToken, MockFeeToken} from "./mocks/MockStockToken.sol";

abstract contract BaseTest is Test {
    HoldsakeTokenList internal tokenList;
    MockStockToken internal usdg;
    MockStockToken internal tsla;
    MockStockToken internal aapl;
    MockStockToken internal nvda;
    MockStockToken internal amzn;
    MockFeeToken internal feeToken;
    MockStockToken internal unlisted;

    address internal multisig = makeAddr("multisig");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        usdg = new MockStockToken("Global Dollar", "USDG");
        tsla = new MockStockToken("Tesla", "TSLA");
        aapl = new MockStockToken("Apple", "AAPL");
        nvda = new MockStockToken("NVIDIA", "NVDA");
        amzn = new MockStockToken("Amazon", "AMZN");
        feeToken = new MockFeeToken();
        unlisted = new MockStockToken("Fake Tesla", "TSLA");

        address[] memory initial = new address[](6);
        initial[0] = address(usdg);
        initial[1] = address(tsla);
        initial[2] = address(aapl);
        initial[3] = address(nvda);
        initial[4] = address(amzn);
        initial[5] = address(feeToken);
        tokenList = new HoldsakeTokenList(multisig, initial);

        address[3] memory people = [alice, bob, carol];
        for (uint256 i; i < people.length; ++i) {
            usdg.mint(people[i], 1_000_000e18);
            tsla.mint(people[i], 1_000_000e18);
            aapl.mint(people[i], 1_000_000e18);
            nvda.mint(people[i], 1_000_000e18);
            amzn.mint(people[i], 1_000_000e18);
            feeToken.mint(people[i], 1_000_000e18);
            unlisted.mint(people[i], 1_000_000e18);
        }
    }
}
