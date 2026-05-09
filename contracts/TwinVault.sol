// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal ERC-20 surface used by the vault. We only need transfer +
/// balanceOf — anything else can be poked via the owner's own EOA
/// because we never grant token approvals from the vault.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title TwinVault
/// @notice Holds a single user's funds (ETH + ERC-20). The user (`owner`)
///         keeps full control — withdraw, set limits, rotate the agent.
///         The agent (typically EthTwin's dev wallet) can spend within
///         caller-set per-tx and per-period caps WITHOUT a user signature,
///         so the AI twin can transact autonomously on the user's behalf.
/// @dev    Designed for a per-user deploy. Constructor-args:
///           _owner — the user's EOA / smart wallet.
///           _agent — the AI twin's signer (dev wallet for the demo).
contract TwinVault {
    address public owner;
    address public agent;

    /// Per-token spend limits enforced by `spend`.
    /// `token == address(0)` is reserved for native ETH.
    /// `period` of 0 disables the period cap (per-tx cap still applies).
    struct Limit {
        uint256 perTxCap;
        uint256 perPeriodCap;
        uint256 period; // seconds
        uint256 spentInPeriod;
        uint256 lastReset;
    }

    mapping(address => Limit) public limits;

    /// Hard floors so a misconfigured owner can't accidentally brick the
    /// agent's ability to send anything at all. perTxCap below this is
    /// rejected — the agent can still be turned off entirely by setting
    /// `setAgent(address(0))`.
    uint256 public constant MIN_PER_TX_CAP = 1; // 1 wei or 1 token-unit
    uint256 public constant MIN_PERIOD_SECONDS = 60; // smallest meaningful window

    event Deposited(address indexed from, uint256 amount);
    event ERC20Received(address indexed token, address indexed from, uint256 amount);
    event Spent(address indexed token, address indexed to, uint256 amount, address indexed agentCaller);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event LimitsUpdated(address indexed token, uint256 perTxCap, uint256 perPeriodCap, uint256 period);
    event AgentRotated(address indexed oldAgent, address indexed newAgent);
    event OwnerTransferred(address indexed oldOwner, address indexed newOwner);

    error NotOwner();
    error NotAgent();
    error TxCapExceeded(uint256 requested, uint256 cap);
    error PeriodCapExceeded(uint256 requested, uint256 remaining);
    error TransferFailed();
    error InvalidLimit();
    error ZeroAmount();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(address _owner, address _agent) {
        require(_owner != address(0), "owner=0");
        owner = _owner;
        agent = _agent; // agent==0 is allowed; means "agent disabled at deploy"
        emit OwnerTransferred(address(0), _owner);
        emit AgentRotated(address(0), _agent);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Deposits — anyone can fund the vault.
    // ─────────────────────────────────────────────────────────────────────

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /// Symbolic helper so a depositor can record an ERC-20 deposit on-chain
    /// for indexing. Just transfer the tokens directly to `address(this)` —
    /// no approval / pull required. Calling this is optional.
    function recordERC20Deposit(address token, uint256 amount) external {
        emit ERC20Received(token, msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Owner ops — require the user's signature.
    // ─────────────────────────────────────────────────────────────────────

    function setLimits(
        address token,
        uint256 perTxCap,
        uint256 perPeriodCap,
        uint256 period
    ) external onlyOwner {
        if (perTxCap < MIN_PER_TX_CAP) revert InvalidLimit();
        if (perPeriodCap > 0 && perPeriodCap < perTxCap) revert InvalidLimit();
        if (period > 0 && period < MIN_PERIOD_SECONDS) revert InvalidLimit();
        Limit storage l = limits[token];
        l.perTxCap = perTxCap;
        l.perPeriodCap = perPeriodCap;
        l.period = period;
        // Reset the period counter so a new cap starts a fresh window.
        l.spentInPeriod = 0;
        l.lastReset = block.timestamp;
        emit LimitsUpdated(token, perTxCap, perPeriodCap, period);
    }

    function setAgent(address newAgent) external onlyOwner {
        emit AgentRotated(agent, newAgent);
        agent = newAgent;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "newOwner=0");
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// Owner can move funds back out at any time, no caps.
    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        _disburse(token, to, amount);
        emit Withdrawn(token, to, amount);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Agent ops — capped, no user signature required.
    // ─────────────────────────────────────────────────────────────────────

    function spend(address token, address to, uint256 amount) external onlyAgent {
        if (amount == 0) revert ZeroAmount();
        _checkAndUpdateLimit(token, amount);
        _disburse(token, to, amount);
        emit Spent(token, to, amount, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────

    function ethBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function tokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /// How much more the agent can spend in the current window for `token`.
    function spendableNow(address token) external view returns (uint256) {
        Limit memory l = limits[token];
        if (l.perTxCap == 0) return 0;
        uint256 windowSpent = l.spentInPeriod;
        if (l.period > 0 && block.timestamp >= l.lastReset + l.period) {
            windowSpent = 0;
        }
        if (l.perPeriodCap == 0) return l.perTxCap; // no period cap → only per-tx
        if (windowSpent >= l.perPeriodCap) return 0;
        uint256 remaining = l.perPeriodCap - windowSpent;
        return remaining < l.perTxCap ? remaining : l.perTxCap;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────

    function _checkAndUpdateLimit(address token, uint256 amount) internal {
        Limit storage l = limits[token];
        if (amount > l.perTxCap) revert TxCapExceeded(amount, l.perTxCap);
        // Roll the period if the window has elapsed.
        if (l.period > 0 && block.timestamp >= l.lastReset + l.period) {
            l.spentInPeriod = 0;
            l.lastReset = block.timestamp;
        }
        if (l.perPeriodCap > 0) {
            uint256 windowSpent = l.spentInPeriod;
            if (windowSpent + amount > l.perPeriodCap) {
                revert PeriodCapExceeded(amount, l.perPeriodCap - windowSpent);
            }
            l.spentInPeriod = windowSpent + amount;
        }
    }

    function _disburse(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            bool ok = IERC20(token).transfer(to, amount);
            if (!ok) revert TransferFailed();
        }
    }
}
