// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./RideToken.sol";
import "./RideEscrow.sol";

/**
 * @title RideDisputeResolver
 * @author RideChain
 * @notice Handles ride disputes via decentralized arbitration.
 * @dev 5 arbitrators vote within 48h. Majority wins. Tie = 50/50 split.
 */
contract RideDisputeResolver is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    RideToken   public rideToken;
    RideEscrow  public rideEscrow;

    uint256 public arbitratorReward = 10 ether;   // 10 RIDE per arbitrator per vote
    uint256 public constant VOTING_PERIOD = 48 hours;
    uint256 public constant EVIDENCE_WINDOW = 24 hours;
    uint256 public constant NUM_ARBITRATORS = 5;

    enum DisputeStatus { Open, Voting, Resolved, Escalated }
    enum Resolution { Pending, RefundPassenger, PayDriver, Split }

    struct Dispute {
        uint256 rideId;
        address opener;
        address respondent;
        string  openerEvidenceIPFS;
        string  respondentEvidenceIPFS;
        DisputeStatus status;
        uint256 votesForOpener;
        uint256 votesForRespondent;
        uint256 openedAt;
        uint256 votingDeadline;
        Resolution resolution;
        address[5] arbitrators;
        bool[5] hasVoted;
    }

    mapping(uint256 => Dispute) public disputes; // rideId → Dispute
    mapping(address => bool)    public isEligibleArbitrator;
    address[] public arbitratorPool;

    // ── Events ─────────────────────────────────────────────────────
    event DisputeCreated(uint256 indexed rideId, address opener);
    event CounterEvidenceSubmitted(uint256 indexed rideId, address respondent);
    event ArbitratorVoted(uint256 indexed rideId, address arbitrator, uint8 vote);
    event DisputeResolved(uint256 indexed rideId, Resolution resolution);
    event DisputeEscalated(uint256 indexed rideId);

    constructor(
        address _rideToken,
        address _rideEscrow,
        address _admin
    ) {
        rideToken  = RideToken(_rideToken);
        rideEscrow = RideEscrow(_rideEscrow);

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
    }

    /**
     * @notice Register addresses as eligible arbitrators.
     */
    function registerArbitrators(address[] calldata arbitrators) external onlyRole(ADMIN_ROLE) {
        for (uint256 i = 0; i < arbitrators.length; i++) {
            if (!isEligibleArbitrator[arbitrators[i]]) {
                isEligibleArbitrator[arbitrators[i]] = true;
                arbitratorPool.push(arbitrators[i]);
            }
        }
    }

    /**
     * @notice Open a dispute on a ride.
     * @param rideId Ride to dispute.
     * @param evidenceIPFS IPFS hash of opener's evidence.
     */
    function openDispute(uint256 rideId, string calldata evidenceIPFS) external {
        require(disputes[rideId].openedAt == 0, "DisputeResolver: already disputed");

        // Verify the caller is involved in the ride
        (,,address driver, address passenger,,,,,,,,,,) = rideEscrow.rides(rideId);
        require(
            msg.sender == driver || msg.sender == passenger,
            "DisputeResolver: not a participant"
        );

        address respondent = msg.sender == driver ? passenger : driver;

        // Select 5 pseudo-random arbitrators
        address[5] memory selected = _selectArbitrators(rideId);

        disputes[rideId] = Dispute({
            rideId: rideId,
            opener: msg.sender,
            respondent: respondent,
            openerEvidenceIPFS: evidenceIPFS,
            respondentEvidenceIPFS: "",
            status: DisputeStatus.Open,
            votesForOpener: 0,
            votesForRespondent: 0,
            openedAt: block.timestamp,
            votingDeadline: block.timestamp + VOTING_PERIOD,
            resolution: Resolution.Pending,
            arbitrators: selected,
            hasVoted: [false, false, false, false, false]
        });

        // Open dispute on escrow
        rideEscrow.openDispute(rideId, keccak256(bytes(evidenceIPFS)));

        emit DisputeCreated(rideId, msg.sender);
    }

    /**
     * @notice Respondent submits counter-evidence.
     */
    function submitCounterEvidence(
        uint256 rideId,
        string calldata evidenceIPFS
    ) external {
        Dispute storage d = disputes[rideId];
        require(msg.sender == d.respondent, "DisputeResolver: not respondent");
        require(
            block.timestamp <= d.openedAt + EVIDENCE_WINDOW,
            "DisputeResolver: evidence window closed"
        );

        d.respondentEvidenceIPFS = evidenceIPFS;
        d.status = DisputeStatus.Voting;

        emit CounterEvidenceSubmitted(rideId, msg.sender);
    }

    /**
     * @notice Arbitrator casts vote.
     * @param rideId Dispute to vote on.
     * @param voteForOpener true = side with opener, false = side with respondent.
     */
    function castVote(uint256 rideId, bool voteForOpener) external nonReentrant {
        Dispute storage d = disputes[rideId];
        require(
            d.status == DisputeStatus.Open || d.status == DisputeStatus.Voting,
            "DisputeResolver: voting closed"
        );
        require(block.timestamp <= d.votingDeadline, "DisputeResolver: deadline passed");

        // Find arbitrator index
        int256 arbIdx = -1;
        for (uint256 i = 0; i < NUM_ARBITRATORS; i++) {
            if (d.arbitrators[i] == msg.sender) {
                arbIdx = int256(i);
                break;
            }
        }
        require(arbIdx >= 0, "DisputeResolver: not an arbitrator for this dispute");
        require(!d.hasVoted[uint256(arbIdx)], "DisputeResolver: already voted");

        d.hasVoted[uint256(arbIdx)] = true;

        if (voteForOpener) {
            d.votesForOpener++;
        } else {
            d.votesForRespondent++;
        }

        // Reward arbitrator
        if (rideToken.balanceOf(address(this)) >= arbitratorReward) {
            rideToken.transfer(msg.sender, arbitratorReward);
        }

        emit ArbitratorVoted(rideId, msg.sender, voteForOpener ? 1 : 2);
    }

    /**
     * @notice Resolve the dispute after voting deadline.
     */
    function resolveDispute(uint256 rideId) external {
        Dispute storage d = disputes[rideId];
        require(
            block.timestamp > d.votingDeadline ||
            (d.votesForOpener + d.votesForRespondent) == NUM_ARBITRATORS,
            "DisputeResolver: voting still active"
        );
        require(d.status != DisputeStatus.Resolved, "DisputeResolver: already resolved");

        uint256 totalVotes = d.votesForOpener + d.votesForRespondent;

        if (totalVotes == 0) {
            // No one voted → escalate to admin
            d.status = DisputeStatus.Escalated;
            emit DisputeEscalated(rideId);
            return;
        }

        d.status = DisputeStatus.Resolved;

        // Determine opener's role to set correct resolution
        (,,address driver,,,,,,,,,,, ) = rideEscrow.rides(rideId);
        bool openerIsPassenger = (d.opener != driver);

        if (d.votesForOpener > d.votesForRespondent) {
            // Opener wins
            d.resolution = openerIsPassenger ? Resolution.RefundPassenger : Resolution.PayDriver;
        } else if (d.votesForRespondent > d.votesForOpener) {
            // Respondent wins
            d.resolution = openerIsPassenger ? Resolution.PayDriver : Resolution.RefundPassenger;
        } else {
            // Tie → 50/50
            d.resolution = Resolution.Split;
        }

        // Execute resolution on escrow
        rideEscrow.resolveDispute(rideId, uint8(d.resolution));

        emit DisputeResolved(rideId, d.resolution);
    }

    /**
     * @notice Admin resolves an escalated dispute.
     */
    function adminResolve(uint256 rideId, uint8 resolution) external onlyRole(ADMIN_ROLE) {
        Dispute storage d = disputes[rideId];
        require(d.status == DisputeStatus.Escalated, "DisputeResolver: not escalated");
        require(resolution >= 1 && resolution <= 3, "DisputeResolver: invalid resolution");

        d.status = DisputeStatus.Resolved;
        d.resolution = Resolution(resolution);
        rideEscrow.resolveDispute(rideId, resolution);

        emit DisputeResolved(rideId, d.resolution);
    }

    // ── Internal helpers ───────────────────────────────────────────

    function _selectArbitrators(uint256 rideId)
        internal
        view
        returns (address[5] memory selected)
    {
        require(arbitratorPool.length >= NUM_ARBITRATORS, "DisputeResolver: not enough arbitrators");

        // Pseudo-random selection (sufficient for this use case)
        uint256 seed = uint256(keccak256(abi.encodePacked(
            block.timestamp, block.prevrandao, rideId, msg.sender
        )));

        uint256 count;
        uint256 poolLen = arbitratorPool.length;
        bool[] memory used = new bool[](poolLen);

        while (count < NUM_ARBITRATORS) {
            seed = uint256(keccak256(abi.encodePacked(seed, count)));
            uint256 idx = seed % poolLen;
            if (!used[idx] && arbitratorPool[idx] != msg.sender) {
                used[idx] = true;
                selected[count] = arbitratorPool[idx];
                count++;
            }
        }
    }

    // ── Admin ──────────────────────────────────────────────────────

    function setArbitratorReward(uint256 newReward) external onlyRole(ADMIN_ROLE) {
        arbitratorReward = newReward;
    }

    function getArbitratorPoolSize() external view returns (uint256) {
        return arbitratorPool.length;
    }
}
