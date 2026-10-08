// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Stand-in for a Robinhood Stock Token: 18-decimal ERC-20 with a corporate-action multiplier
/// (ERC-8056 style, balances never change), a pause switch and a blocklist that reverts any
/// transfer to or from a blocked address. Mirrors what "Verify first" expects to find; replace
/// assumptions with the real token's behaviour once it's been read.
contract MockStockToken is ERC20 {
    uint256 public uiMultiplier = 1e18;
    bool public paused;
    mapping(address => bool) public blocked;

    error TokenPaused();
    error AddressBlocked(address account);

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setMultiplier(uint256 multiplier) external {
        uiMultiplier = multiplier;
    }

    function setPaused(bool paused_) external {
        paused = paused_;
    }

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (paused) revert TokenPaused();
        if (blocked[from]) revert AddressBlocked(from);
        if (blocked[to]) revert AddressBlocked(to);
        super._update(from, to, value);
    }
}

/// Takes a 1% cut on every transfer, to prove contracts credit what arrived, not what was asked.
contract MockFeeToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) return super._update(from, to, value);
        uint256 fee = value / 100;
        super._update(from, address(0xdead), fee);
        super._update(from, to, value - fee);
    }
}
