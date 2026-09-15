// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBigPadEscrow {
    function contributions(address) external view returns (uint256);
    function deadline() external view returns (uint256);
    function recipient() external view returns (address);
}

/// @notice Standalone identity vote for a BigPad round — name, ticker,
/// logo, roadmap, launch date — read-only against the already-deployed
/// BigPadEscrow. Deliberately a separate contract: the fund-holding
/// contract is already live on mainnet, already tested, and this feature
/// has no reason to touch it.
///
/// Voting weight for an address is escrow.contributions(address), read
/// live rather than copied into a snapshot here. That's safe because
/// BigPadEscrow freezes every contribution the moment its own raise
/// closes — contribute() and refund() both revert once the deadline has
/// passed — so from that point on the escrow's own state already IS the
/// snapshot, for as long as this contract cares to read it.
contract BigPadVote {
    enum Category {
        Name,
        Ticker,
        Logo,
        Roadmap,
        LaunchDate
    }

    uint256 public constant VOTING_WINDOW = 48 hours;
    uint8 public constant CATEGORY_COUNT = 5;

    IBigPadEscrow public immutable escrow;
    address public immutable recipient;
    /// @notice Voting closes at escrow.deadline() + VOTING_WINDOW, fixed
    /// at deploy time — the escrow's deadline itself never changes once set.
    uint256 public immutable votingEnds;

    mapping(uint8 => string[]) private _options;
    mapping(uint8 => bool) public optionsSet;
    mapping(uint8 => mapping(uint256 => uint256)) public optionWeight;
    /// @dev 0 means "hasn't voted"; a real choice is stored as (index + 1).
    mapping(uint8 => mapping(address => uint256)) private _voted;

    event OptionsProposed(uint8 indexed category, string[] options);
    event Voted(uint8 indexed category, address indexed voter, uint256 optionIndex, uint256 weight);

    error NotRecipient();
    error InvalidCategory();
    error OptionsAlreadySet();
    error OptionsNotSet();
    error TooFewOptions();
    error InvalidOption();
    error VotingNotOpenYet();
    error VotingClosed();
    error NoWeight();

    constructor(address escrow_) {
        require(escrow_ != address(0), "escrow is zero address");
        IBigPadEscrow e = IBigPadEscrow(escrow_);
        uint256 deadline_ = e.deadline();
        require(deadline_ > 0, "escrow has not started");
        escrow = e;
        recipient = e.recipient();
        votingEnds = deadline_ + VOTING_WINDOW;
    }

    modifier onlyRecipient() {
        if (msg.sender != recipient) revert NotRecipient();
        _;
    }

    modifier validCategory(uint8 category) {
        if (category >= CATEGORY_COUNT) revert InvalidCategory();
        _;
    }

    /// @notice Recipient proposes the candidate options for one category —
    /// once each, any time before voting closes. Not gated on the raise
    /// having closed yet, so voting can open the moment it does instead of
    /// waiting on this step.
    function proposeOptions(uint8 category, string[] calldata newOptions) external onlyRecipient validCategory(category) {
        if (optionsSet[category]) revert OptionsAlreadySet();
        if (newOptions.length < 2) revert TooFewOptions();
        if (block.timestamp >= votingEnds) revert VotingClosed();

        for (uint256 i = 0; i < newOptions.length; i++) {
            _options[category].push(newOptions[i]);
        }
        optionsSet[category] = true;
        emit OptionsProposed(category, newOptions);
    }

    /// @notice Cast (or change) your vote for one option in one category.
    /// Weight is your current escrow contribution — frozen since the
    /// escrow's raise has closed, which is also when voting opens.
    function vote(uint8 category, uint256 optionIndex) external validCategory(category) {
        if (!optionsSet[category]) revert OptionsNotSet();
        if (block.timestamp < escrow.deadline()) revert VotingNotOpenYet();
        if (block.timestamp >= votingEnds) revert VotingClosed();
        if (optionIndex >= _options[category].length) revert InvalidOption();

        uint256 weight = escrow.contributions(msg.sender);
        if (weight == 0) revert NoWeight();

        uint256 prev = _voted[category][msg.sender];
        if (prev != 0) {
            optionWeight[category][prev - 1] -= weight;
        }
        _voted[category][msg.sender] = optionIndex + 1;
        optionWeight[category][optionIndex] += weight;

        emit Voted(category, msg.sender, optionIndex, weight);
    }

    /// @notice The candidate options for a category, in proposal order.
    function options(uint8 category) external view validCategory(category) returns (string[] memory) {
        return _options[category];
    }

    /// @notice Whether `voter` has voted in `category`, and which option.
    function myVote(uint8 category, address voter) external view validCategory(category) returns (bool hasVoted, uint256 optionIndex) {
        uint256 v = _voted[category][voter];
        return (v != 0, v == 0 ? 0 : v - 1);
    }

    /// @notice The option currently ahead in a category and its total
    /// weight. Ties resolve to whichever option was proposed first.
    function leading(uint8 category) external view validCategory(category) returns (uint256 optionIndex, uint256 weight) {
        uint256 len = _options[category].length;
        uint256 bestIdx = 0;
        uint256 bestWeight = 0;
        for (uint256 i = 0; i < len; i++) {
            uint256 w = optionWeight[category][i];
            if (w > bestWeight) {
                bestWeight = w;
                bestIdx = i;
            }
        }
        return (bestIdx, bestWeight);
    }

    /// @notice Whether vote() would currently succeed for an eligible voter.
    function votingOpen() external view returns (bool) {
        return block.timestamp >= escrow.deadline() && block.timestamp < votingEnds;
    }
}
