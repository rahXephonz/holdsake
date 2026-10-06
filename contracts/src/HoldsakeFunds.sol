// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {HoldsakeTokenList} from "./HoldsakeTokenList.sol";

/// @title HoldsakeFunds
/// @notice Goal funds: anyone can add the fund's stocks, only the beneficiary can take them out,
/// and only once the unlock date has passed. Beneficiary, unlock date and mix are fixed at
/// creation and can never change.
/// @dev Non-upgradeable, no admin. Contributions are limited to the mix and to at least `minRaw`
/// per call, so a stranger can't fill a fund with dust. `minRaw` is a raw token amount, not a
/// dollar value: this contract has no oracle and must not get one.
contract HoldsakeFunds is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// Tokens in a fund's mix. Re-measure gas before raising it.
    uint256 public constant MAX_FUND_STOCKS = 3;
    /// Furthest unlock date allowed at creation, so a typo can't lock money for centuries.
    uint256 public constant MAX_FUND_LOCK = 25 * 365 days;

    HoldsakeTokenList public immutable tokenList;

    struct MixEntry {
        address token;
        uint256 minRaw;
    }

    struct Fund {
        address creator;
        uint64 unlockAt;
        address beneficiary;
    }

    uint256 public fundCount;
    mapping(uint256 id => Fund) private _funds;
    mapping(uint256 id => MixEntry[]) private _mix;
    /// Zero means the token isn't in the fund's mix.
    mapping(uint256 id => mapping(address token => uint256)) public minRaw;
    mapping(uint256 id => mapping(address token => uint256)) public balanceOf;
    /// Raw amount of each token this contract owes across all funds.
    mapping(address token => uint256) public owed;

    event FundCreated(
        uint256 indexed id,
        address indexed creator,
        address indexed beneficiary,
        uint64 unlockAt,
        address[] tokens,
        uint256[] minRaws
    );
    event Contributed(
        uint256 indexed id, address indexed contributor, address indexed token, uint256 amount
    );
    event Withdrawn(uint256 indexed id, address indexed token, address to, uint256 amount);

    error ZeroAddress();
    error InvalidUnlock();
    error EmptyMix();
    error TooManyStocks();
    error DuplicateToken(address token);
    error TokenNotAllowed(address token);
    error ZeroMinimum();
    error UnknownFund(uint256 id);
    error NotInMix(address token);
    error BelowMinimum(uint256 received, uint256 minimum);
    error NotBeneficiary();
    error Locked();
    error NothingToWithdraw(uint256 id);

    constructor(HoldsakeTokenList tokenList_) {
        if (address(tokenList_) == address(0)) revert ZeroAddress();
        tokenList = tokenList_;
    }

    function createFund(address beneficiary, uint64 unlockAt, MixEntry[] calldata mix)
        external
        returns (uint256 id)
    {
        if (beneficiary == address(0)) revert ZeroAddress();
        if (unlockAt <= block.timestamp || unlockAt > block.timestamp + MAX_FUND_LOCK) {
            revert InvalidUnlock();
        }
        if (mix.length == 0) revert EmptyMix();
        if (mix.length > MAX_FUND_STOCKS) revert TooManyStocks();

        id = ++fundCount;
        _funds[id] = Fund({creator: msg.sender, unlockAt: unlockAt, beneficiary: beneficiary});

        address[] memory tokens = new address[](mix.length);
        uint256[] memory minRaws = new uint256[](mix.length);
        for (uint256 i; i < mix.length; ++i) {
            address token = mix[i].token;
            if (!tokenList.isAllowed(token)) revert TokenNotAllowed(token);
            if (mix[i].minRaw == 0) revert ZeroMinimum();
            if (minRaw[id][token] != 0) revert DuplicateToken(token);

            minRaw[id][token] = mix[i].minRaw;
            _mix[id].push(mix[i]);
            tokens[i] = token;
            minRaws[i] = mix[i].minRaw;
        }

        emit FundCreated(id, msg.sender, beneficiary, unlockAt, tokens, minRaws);
    }

    /// @notice Adds `amount` of one of the fund's tokens. Anyone can contribute, before or after
    /// the unlock date. What's credited is what actually arrived.
    function contribute(uint256 id, address token, uint256 amount) external nonReentrant {
        _fund(id);
        uint256 minimum = minRaw[id][token];
        if (minimum == 0) revert NotInMix(token);

        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        if (received < minimum) revert BelowMinimum(received, minimum);

        balanceOf[id][token] += received;
        owed[token] += received;
        emit Contributed(id, msg.sender, token, received);
    }

    /// @notice Beneficiary only, after unlock: pays out every token with a balance. If one token
    /// can't be paid (paused or blocked), this reverts; use `withdrawToken` for the others.
    function withdraw(uint256 id, address to) external nonReentrant {
        _checkWithdraw(id, to);
        MixEntry[] storage mix = _mix[id];
        uint256 paid;
        for (uint256 i; i < mix.length; ++i) {
            if (_payOut(id, mix[i].token, to)) ++paid;
        }
        if (paid == 0) revert NothingToWithdraw(id);
    }

    /// @notice Beneficiary only, after unlock: pays out one token.
    function withdrawToken(uint256 id, address token, address to) external nonReentrant {
        _checkWithdraw(id, to);
        if (!_payOut(id, token, to)) revert NothingToWithdraw(id);
    }

    function getFund(uint256 id)
        external
        view
        returns (Fund memory fund, MixEntry[] memory mix, uint256[] memory balances)
    {
        fund = _fund(id);
        mix = _mix[id];
        balances = new uint256[](mix.length);
        for (uint256 i; i < mix.length; ++i) {
            balances[i] = balanceOf[id][mix[i].token];
        }
    }

    function _fund(uint256 id) private view returns (Fund storage fund) {
        fund = _funds[id];
        if (fund.beneficiary == address(0)) revert UnknownFund(id);
    }

    function _checkWithdraw(uint256 id, address to) private view {
        if (to == address(0)) revert ZeroAddress();
        Fund storage fund = _fund(id);
        if (msg.sender != fund.beneficiary) revert NotBeneficiary();
        if (block.timestamp < fund.unlockAt) revert Locked();
    }

    function _payOut(uint256 id, address token, address to) private returns (bool) {
        uint256 amount = balanceOf[id][token];
        if (amount == 0) return false;
        balanceOf[id][token] = 0;
        owed[token] -= amount;
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(id, token, to, amount);
        return true;
    }
}
