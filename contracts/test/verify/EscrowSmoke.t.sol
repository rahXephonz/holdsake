// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// Throwaway escrow for "Verify first" step 2. Not product code: it only proves a contract can
/// receive, hold and release a Stock Token and USDG on Robinhood Chain.
contract SmokeEscrow {
    using SafeERC20 for IERC20;

    struct Lock {
        address sender;
        address recipient;
        IERC20 token;
        uint256 amount;
        uint64 expiresAt;
        bool open;
    }

    Lock[] public locks;

    function create(address recipient, IERC20 token, uint256 amount) external returns (uint256 id) {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        locks.push(
            Lock(msg.sender, recipient, token, received, uint64(block.timestamp + 30 days), true)
        );
        return locks.length - 1;
    }

    function claim(uint256 id, address to) external {
        Lock storage l = locks[id];
        require(l.open && msg.sender == l.recipient && block.timestamp < l.expiresAt, "claim");
        l.open = false;
        l.token.safeTransfer(to, l.amount);
    }

    function refund(uint256 id) external {
        Lock storage l = locks[id];
        require(l.open, "closed");
        require(msg.sender == l.sender || block.timestamp >= l.expiresAt, "refund");
        l.open = false;
        l.token.safeTransfer(l.sender, l.amount);
    }
}

/// Run with `moon run contracts:verify`. Set VERIFY_TOKEN (a canonical Stock Token from
/// Robinhood's registry, or USDG) and VERIFY_HOLDER (an address holding it) in apps/app/.env.
contract EscrowSmokeTest is Test {
    SmokeEscrow escrow;
    IERC20 token;
    address holder;
    address recipient = makeAddr("recipient");
    address stranger = makeAddr("stranger");
    uint256 amount;

    function setUp() public {
        require(block.chainid == 4663, "run against a Robinhood Chain fork");
        token = IERC20(vm.envAddress("VERIFY_TOKEN"));
        holder = vm.envAddress("VERIFY_HOLDER");
        amount = token.balanceOf(holder) / 10;
        require(amount > 0, "holder has no balance");
        escrow = new SmokeEscrow();
        vm.prank(holder);
        token.approve(address(escrow), type(uint256).max);
    }

    function _create() internal returns (uint256 id) {
        vm.prank(holder);
        id = escrow.create(recipient, token, amount);
        assertEq(token.balanceOf(address(escrow)), amount, "escrow holds the full amount");
    }

    function test_createThenClaim() public {
        uint256 id = _create();
        vm.prank(recipient);
        escrow.claim(id, recipient);
        assertEq(token.balanceOf(recipient), amount);
    }

    function test_createThenSenderRefund() public {
        uint256 before = token.balanceOf(holder);
        uint256 id = _create();
        vm.prank(holder);
        escrow.refund(id);
        assertEq(token.balanceOf(holder), before);
    }

    function test_createExpireThenAnyoneRefunds() public {
        uint256 before = token.balanceOf(holder);
        uint256 id = _create();
        vm.warp(block.timestamp + 30 days);
        vm.prank(recipient);
        vm.expectRevert(bytes("claim"));
        escrow.claim(id, recipient);
        vm.prank(stranger);
        escrow.refund(id);
        assertEq(token.balanceOf(holder), before);
    }
}
