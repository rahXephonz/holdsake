// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {HoldsakeTokenList} from "../src/HoldsakeTokenList.sol";
import {BaseTest} from "./Base.t.sol";

contract HoldsakeTokenListTest is BaseTest {
    function test_initialTokensAllowed() public view {
        assertTrue(tokenList.isAllowed(address(tsla)));
        assertTrue(tokenList.isAllowed(address(usdg)));
        assertFalse(tokenList.isAllowed(address(unlisted)));
    }

    function test_ownerAddsToken() public {
        vm.prank(multisig);
        tokenList.addToken(address(unlisted));
        assertTrue(tokenList.isAllowed(address(unlisted)));
    }

    function test_onlyOwnerAdds() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        tokenList.addToken(address(unlisted));
    }

    function test_rejectsNonContract() public {
        vm.prank(multisig);
        vm.expectRevert(abi.encodeWithSelector(HoldsakeTokenList.NotAContract.selector, alice));
        tokenList.addToken(alice);
    }

    function test_rejectsDuplicate() public {
        vm.prank(multisig);
        vm.expectRevert(
            abi.encodeWithSelector(HoldsakeTokenList.AlreadyAllowed.selector, address(tsla))
        );
        tokenList.addToken(address(tsla));
    }

    function test_ownershipTransferIsTwoStep() public {
        vm.prank(multisig);
        tokenList.transferOwnership(alice);
        assertEq(tokenList.owner(), multisig);
        vm.prank(alice);
        tokenList.acceptOwnership();
        assertEq(tokenList.owner(), alice);
    }
}
