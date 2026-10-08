// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title HoldsakeTokenList
/// @notice The tokens allowed into Holdsake escrow: canonical Robinhood Stock Tokens and USDG,
/// added by address, never by symbol. The list only grows. The owner (a multisig) can add a
/// token and nothing else: it can't remove one and it never touches escrowed funds, so a token
/// added by mistake only affects gifts and funds made with that token.
contract HoldsakeTokenList is Ownable2Step {
    mapping(address token => bool) public isAllowed;

    event TokenAdded(address indexed token);

    error NotAContract(address token);
    error AlreadyAllowed(address token);

    constructor(address owner_, address[] memory initialTokens) Ownable(owner_) {
        for (uint256 i; i < initialTokens.length; ++i) {
            _add(initialTokens[i]);
        }
    }

    function addToken(address token) external onlyOwner {
        _add(token);
    }

    function _add(address token) private {
        if (token.code.length == 0) revert NotAContract(token);
        if (isAllowed[token]) revert AlreadyAllowed(token);
        isAllowed[token] = true;
        emit TokenAdded(token);
    }
}
