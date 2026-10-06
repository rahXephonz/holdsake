// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {HoldsakeTokenList} from "./HoldsakeTokenList.sol";

/// @title HoldsakeGifts
/// @notice Escrow for gifts of Stock Tokens and cash. A gift is locked to one recipient, who can
/// open it until it expires; the sender can take it back until the recipient opens any of it;
/// after expiry anyone can send what's left back to the sender.
/// @dev Non-upgradeable, no admin. A fix ships as a new contract; gifts finish on the version that
/// created them. Gift details are public on-chain: don't describe them as private.
contract HoldsakeGifts is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// Set by the contract, never by the caller, so a gift always goes back after this long.
    uint256 public constant GIFT_DURATION = 30 days;
    /// Stock items per gift (cash is counted apart). Re-measure gas before raising it.
    uint256 public constant MAX_GIFT_STOCKS = 3;

    HoldsakeTokenList public immutable tokenList;
    /// USDG. At most one cash item per gift, on top of the stocks.
    address public immutable cash;

    struct ItemInput {
        address token;
        uint256 amount;
    }

    struct Item {
        address token;
        bool settled;
        uint256 amount;
    }

    struct Gift {
        address sender;
        uint64 expiresAt;
        bool opened;
        address recipient;
    }

    uint256 public giftCount;
    mapping(uint256 id => Gift) private _gifts;
    mapping(uint256 id => Item[]) private _items;
    /// Raw amount of each token this contract owes across all open items.
    mapping(address token => uint256) public owed;

    event GiftCreated(
        uint256 indexed id,
        address indexed sender,
        address indexed recipient,
        uint64 expiresAt,
        address[] tokens,
        uint256[] amounts
    );
    event ItemClaimed(
        uint256 indexed id, uint256 index, address indexed to, address token, uint256 amount
    );
    event ItemRefunded(
        uint256 indexed id, uint256 index, address indexed to, address token, uint256 amount
    );

    error ZeroAddress();
    error InvalidRecipient();
    error NoItems();
    error TooManyStocks();
    error TooManyCashItems();
    error DuplicateToken(address token);
    error TokenNotAllowed(address token);
    error ZeroAmount();
    error NothingReceived(address token);
    error UnknownGift(uint256 id);
    error UnknownItem(uint256 id, uint256 index);
    error NotRecipient();
    error NotSender();
    error Expired();
    error NotRefundable();
    error AlreadySettled(uint256 id, uint256 index);
    error NothingToSettle(uint256 id);

    constructor(HoldsakeTokenList tokenList_, address cash_) {
        if (address(tokenList_) == address(0) || cash_ == address(0)) revert ZeroAddress();
        tokenList = tokenList_;
        cash = cash_;
    }

    // ---------------------------------------------------------------------------------------
    // Create
    // ---------------------------------------------------------------------------------------

    /// @notice Locks `items` for `recipient`. The sender must have approved (or permitted) each
    /// amount. What's recorded is what actually arrived, not what was asked for.
    function createGift(address recipient, ItemInput[] calldata items)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (recipient == address(0) || recipient == msg.sender) {
            revert InvalidRecipient();
        }
        _validateItems(items);

        id = ++giftCount;
        uint64 expiresAt = uint64(block.timestamp + GIFT_DURATION);
        _gifts[id] =
            Gift({sender: msg.sender, expiresAt: expiresAt, opened: false, recipient: recipient});

        address[] memory tokens = new address[](items.length);
        uint256[] memory amounts = new uint256[](items.length);
        Item[] storage stored = _items[id];
        for (uint256 i; i < items.length; ++i) {
            IERC20 token = IERC20(items[i].token);
            uint256 before = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), items[i].amount);
            uint256 received = token.balanceOf(address(this)) - before;
            if (received == 0) revert NothingReceived(address(token));

            stored.push(Item({token: address(token), settled: false, amount: received}));
            owed[address(token)] += received;
            tokens[i] = address(token);
            amounts[i] = received;
        }

        emit GiftCreated(id, msg.sender, recipient, expiresAt, tokens, amounts);
    }

    // ---------------------------------------------------------------------------------------
    // Claim (recipient, before expiry, to any address they choose)
    // ---------------------------------------------------------------------------------------

    /// @notice Opens every unsettled item, paying to `to`. If one item can't be paid (a paused or
    /// blocked token), this reverts; use `claimItem` for the others.
    function claimGift(uint256 id, address to) external nonReentrant {
        Gift storage gift = _openForClaim(id, to);
        gift.opened = true;
        if (_settleAll(id, to, true) == 0) revert NothingToSettle(id);
    }

    /// @notice Opens one item, so one stuck token never blocks the rest.
    function claimItem(uint256 id, uint256 index, address to) external nonReentrant {
        Gift storage gift = _openForClaim(id, to);
        gift.opened = true;
        _settle(id, index, to, true);
    }

    // ---------------------------------------------------------------------------------------
    // Refund
    //   - the sender, any time until the recipient opens any item, and any time after expiry;
    //   - anyone else, only after expiry, and always to the stored sender.
    // ---------------------------------------------------------------------------------------

    /// @notice Sends every unsettled item back to the sender.
    function refundGift(uint256 id) external nonReentrant {
        Gift storage gift = _gift(id);
        _checkRefund(gift, false);
        if (_settleAll(id, gift.sender, false) == 0) revert NothingToSettle(id);
    }

    /// @notice Sender only: sends every unsettled item to `to` (e.g. if the sender's own address
    /// can no longer receive the token).
    function refundGiftTo(uint256 id, address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        Gift storage gift = _gift(id);
        _checkRefund(gift, true);
        if (_settleAll(id, to, false) == 0) revert NothingToSettle(id);
    }

    function refundItem(uint256 id, uint256 index) external nonReentrant {
        Gift storage gift = _gift(id);
        _checkRefund(gift, false);
        _settle(id, index, gift.sender, false);
    }

    function refundItemTo(uint256 id, uint256 index, address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        Gift storage gift = _gift(id);
        _checkRefund(gift, true);
        _settle(id, index, to, false);
    }

    // ---------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------

    function getGift(uint256 id) external view returns (Gift memory gift, Item[] memory items) {
        gift = _gift(id);
        items = _items[id];
    }

    // ---------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------

    function _validateItems(ItemInput[] calldata items) private view {
        if (items.length == 0) revert NoItems();
        uint256 stocks;
        uint256 cashItems;
        for (uint256 i; i < items.length; ++i) {
            address token = items[i].token;
            if (items[i].amount == 0) revert ZeroAmount();
            if (!tokenList.isAllowed(token)) revert TokenNotAllowed(token);
            if (token == cash) {
                if (++cashItems > 1) revert TooManyCashItems();
            } else if (++stocks > MAX_GIFT_STOCKS) {
                revert TooManyStocks();
            }
            for (uint256 j; j < i; ++j) {
                if (items[j].token == token) revert DuplicateToken(token);
            }
        }
    }

    function _gift(uint256 id) private view returns (Gift storage gift) {
        gift = _gifts[id];
        if (gift.sender == address(0)) revert UnknownGift(id);
    }

    function _openForClaim(uint256 id, address to) private view returns (Gift storage gift) {
        if (to == address(0)) revert ZeroAddress();
        gift = _gift(id);
        if (msg.sender != gift.recipient) revert NotRecipient();
        if (block.timestamp >= gift.expiresAt) revert Expired();
    }

    function _checkRefund(Gift storage gift, bool customTo) private view {
        bool expired = block.timestamp >= gift.expiresAt;
        if (msg.sender == gift.sender) {
            if (gift.opened && !expired) revert NotRefundable();
        } else {
            if (customTo) revert NotSender();
            if (!expired) revert NotRefundable();
        }
    }

    function _settleAll(uint256 id, address to, bool claim) private returns (uint256 paid) {
        uint256 count = _items[id].length;
        for (uint256 i; i < count; ++i) {
            if (!_items[id][i].settled) {
                _settle(id, i, to, claim);
                ++paid;
            }
        }
    }

    function _settle(uint256 id, uint256 index, address to, bool claim) private {
        Item[] storage items = _items[id];
        if (index >= items.length) revert UnknownItem(id, index);
        Item storage item = items[index];
        if (item.settled) revert AlreadySettled(id, index);

        item.settled = true;
        owed[item.token] -= item.amount;
        IERC20(item.token).safeTransfer(to, item.amount);

        if (claim) emit ItemClaimed(id, index, to, item.token, item.amount);
        else emit ItemRefunded(id, index, to, item.token, item.amount);
    }
}
