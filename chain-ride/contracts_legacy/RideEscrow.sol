// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./RideToken.sol";
import "./FeeManager.sol";
import "./ReputationNFT.sol";

/**
 * @title RideEscrow
 * @author RideChain
 * @notice Core ride payment escrow. Locks RIDE tokens on booking,
 *         releases to driver on completion, handles cancellation refunds.
 */
contract RideEscrow is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    RideToken public rideToken;
    FeeManager public feeManager;
    ReputationNFT public reputationNFT;
    address public treasury;

    uint256 public rideCounter;

    // ── Ride status enum ───────────────────────────────────────────
    enum RideStatus { Booked, Pickup, Active, Completed, Cancelled, Disputed }
    enum RideType { OnDemand, Carpool }

    struct Ride {
        uint256 rideId;
        address driver;
        address passenger;
        RideType rideType;
        uint256 fare;             // total fare in RIDE wei
        uint256 platformFee;      // platform's cut
        uint256 driverPayout;     // fare minus platformFee
        RideStatus status;
        uint256 createdAt;
        uint256 completedAt;
        bytes32 routeHash;        // keccak256 of route data
        uint256 tipAmount;
        bool driverConfirmed;
        bool passengerConfirmed;
    }

    mapping(uint256 => Ride) public rides;
    mapping(address => uint256[]) public driverRideIds;
    mapping(address => uint256[]) public passengerRideIds;

    // ── Cancellation timing ────────────────────────────────────────
    uint256 public constant CANCEL_FREE_WINDOW = 3 minutes;
    uint256 public constant TIP_WINDOW = 24 hours;
    uint256 public constant STUCK_ESCROW_TIMEOUT = 7 days;

    // ── Events ─────────────────────────────────────────────────────
    event RideCreated(uint256 indexed rideId, address indexed driver, address indexed passenger, uint256 fare);
    event PickupConfirmed(uint256 indexed rideId, uint256 timestamp);
    event RideActivated(uint256 indexed rideId, uint256 timestamp);
    event RideCompleted(uint256 indexed rideId, uint256 driverPayout, uint256 platformFee);
    event RideCancelled(uint256 indexed rideId, address cancelledBy, uint256 refundAmount, uint256 fee);
    event TipAdded(uint256 indexed rideId, uint256 tipAmount);
    event DisputeOpened(uint256 indexed rideId, address opener, bytes32 evidenceHash);

    constructor(
        address _rideToken,
        address _feeManager,
        address _reputationNFT,
        address _treasury,
        address _admin
    ) {
        rideToken = RideToken(_rideToken);
        feeManager = FeeManager(_feeManager);
        reputationNFT = ReputationNFT(_reputationNFT);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
    }

    /**
     * @notice Passenger creates a ride and locks RIDE tokens in escrow.
     * @param driver Matched driver address.
     * @param fare Total fare amount in RIDE wei.
     * @param rideType 0 = OnDemand, 1 = Carpool.
     * @param routeHash keccak256 hash of route data for verification.
     */
    function createRide(
        address driver,
        uint256 fare,
        uint8 rideType,
        bytes32 routeHash
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(driver != address(0), "RideEscrow: invalid driver");
        require(driver != msg.sender, "RideEscrow: cannot ride with self");
        require(fare > 0, "RideEscrow: fare must be > 0");
        require(rideType <= 1, "RideEscrow: invalid ride type");

        // Transfer RIDE tokens from passenger to escrow
        require(
            rideToken.transferFrom(msg.sender, address(this), fare),
            "RideEscrow: token transfer failed"
        );

        rideCounter++;
        uint256 rideId = rideCounter;

        // Calculate fee split
        uint256 platformFee;
        uint256 driverPayout;
        if (rideType == 0) {
            // On-demand: fee calculated by FeeManager (already calculated off-chain, just validate)
            platformFee = (fare * feeManager.platformFeePercent()) / 10000;
        } else {
            // Carpool: lower fee
            platformFee = (fare * feeManager.carpoolFeePercent()) / 10000;
        }
        driverPayout = fare - platformFee;

        rides[rideId] = Ride({
            rideId: rideId,
            driver: driver,
            passenger: msg.sender,
            rideType: RideType(rideType),
            fare: fare,
            platformFee: platformFee,
            driverPayout: driverPayout,
            status: RideStatus.Booked,
            createdAt: block.timestamp,
            completedAt: 0,
            routeHash: routeHash,
            tipAmount: 0,
            driverConfirmed: false,
            passengerConfirmed: false
        });

        driverRideIds[driver].push(rideId);
        passengerRideIds[msg.sender].push(rideId);

        emit RideCreated(rideId, driver, msg.sender, fare);
        return rideId;
    }

    /**
     * @notice Driver confirms pickup.
     */
    function confirmPickup(uint256 rideId) external {
        Ride storage ride = rides[rideId];
        require(ride.status == RideStatus.Booked, "RideEscrow: not booked");
        require(msg.sender == ride.driver, "RideEscrow: not driver");

        ride.status = RideStatus.Pickup;
        ride.driverConfirmed = true;

        emit PickupConfirmed(rideId, block.timestamp);
    }

    /**
     * @notice Activate the ride (passenger picked up).
     */
    function activateRide(uint256 rideId) external {
        Ride storage ride = rides[rideId];
        require(
            ride.status == RideStatus.Pickup || ride.status == RideStatus.Booked,
            "RideEscrow: invalid status"
        );
        require(
            msg.sender == ride.driver || msg.sender == ride.passenger,
            "RideEscrow: not authorized"
        );

        ride.status = RideStatus.Active;
        emit RideActivated(rideId, block.timestamp);
    }

    /**
     * @notice Complete the ride. Releases payment to driver and fee to treasury.
     * @param rideId ID of the ride to complete.
     * @param passengerStars Rating for passenger (1–5, given by driver).
     * @param driverStars Rating for driver (1–5, given by passenger).
     */
    function completeRide(
        uint256 rideId,
        uint8 passengerStars,
        uint8 driverStars
    ) external nonReentrant {
        Ride storage ride = rides[rideId];
        require(
            ride.status == RideStatus.Active || ride.status == RideStatus.Pickup,
            "RideEscrow: not active"
        );
        require(
            msg.sender == ride.driver || msg.sender == ride.passenger,
            "RideEscrow: not authorized"
        );

        ride.status = RideStatus.Completed;
        ride.completedAt = block.timestamp;

        // Transfer payout to driver
        require(
            rideToken.transfer(ride.driver, ride.driverPayout),
            "RideEscrow: driver transfer failed"
        );

        // Transfer platform fee to treasury
        require(
            rideToken.transfer(treasury, ride.platformFee),
            "RideEscrow: treasury transfer failed"
        );

        // Record rides & ratings in ReputationNFT
        uint256 driverTokenId = reputationNFT.walletToTokenId(ride.driver);
        uint256 passengerTokenId = reputationNFT.walletToTokenId(ride.passenger);

        if (driverTokenId != 0 && driverStars >= 1 && driverStars <= 5) {
            reputationNFT.recordRide(driverTokenId, driverStars, true);
        }
        if (passengerTokenId != 0 && passengerStars >= 1 && passengerStars <= 5) {
            reputationNFT.recordRide(passengerTokenId, passengerStars, false);
        }

        emit RideCompleted(rideId, ride.driverPayout, ride.platformFee);
    }

    /**
     * @notice Cancel a ride with refund logic per the refund matrix.
     * @param rideId ID of the ride to cancel.
     */
    function cancelRide(uint256 rideId) external nonReentrant {
        Ride storage ride = rides[rideId];
        require(
            ride.status == RideStatus.Booked ||
            ride.status == RideStatus.Pickup,
            "RideEscrow: cannot cancel now"
        );
        require(
            msg.sender == ride.driver || msg.sender == ride.passenger,
            "RideEscrow: not authorized"
        );

        ride.status = RideStatus.Cancelled;

        uint256 refundAmount;
        uint256 driverGets;

        if (msg.sender == ride.driver) {
            // Driver cancels → full refund to passenger
            refundAmount = ride.fare;
            driverGets = 0;
        } else {
            // Passenger cancels
            uint256 elapsed = block.timestamp - ride.createdAt;
            if (ride.status == RideStatus.Booked || elapsed <= CANCEL_FREE_WINDOW) {
                // Before driver accepts or within 3 min → full refund
                refundAmount = ride.fare;
                driverGets = 0;
            } else {
                // After 3 min → cancellation fee to driver
                uint256 cancelFee = feeManager.cancellationFee();
                if (cancelFee > ride.fare) cancelFee = ride.fare;
                refundAmount = ride.fare - cancelFee;
                driverGets = cancelFee;
            }
        }

        if (refundAmount > 0) {
            rideToken.transfer(ride.passenger, refundAmount);
        }
        if (driverGets > 0) {
            rideToken.transfer(ride.driver, driverGets);
        }

        emit RideCancelled(rideId, msg.sender, refundAmount, driverGets);
    }

    /**
     * @notice Passenger adds a tip (within 24h of completion).
     * @param rideId Ride to tip.
     * @param tipAmount Amount of RIDE tokens to tip.
     */
    function addTip(uint256 rideId, uint256 tipAmount) external nonReentrant {
        Ride storage ride = rides[rideId];
        require(ride.status == RideStatus.Completed, "RideEscrow: ride not completed");
        require(msg.sender == ride.passenger, "RideEscrow: only passenger");
        require(
            block.timestamp <= ride.completedAt + TIP_WINDOW,
            "RideEscrow: tip window closed"
        );
        require(tipAmount > 0, "RideEscrow: tip must be > 0");

        // Transfer tip directly to driver (no platform fee on tips)
        require(
            rideToken.transferFrom(msg.sender, ride.driver, tipAmount),
            "RideEscrow: tip transfer failed"
        );

        ride.tipAmount += tipAmount;
        emit TipAdded(rideId, tipAmount);
    }

    /**
     * @notice Open a dispute on a ride.
     * @param rideId Ride in dispute.
     * @param evidenceHash IPFS hash of evidence.
     */
    function openDispute(uint256 rideId, bytes32 evidenceHash) external {
        Ride storage ride = rides[rideId];
        require(
            ride.status == RideStatus.Active ||
            ride.status == RideStatus.Completed,
            "RideEscrow: cannot dispute"
        );
        require(
            msg.sender == ride.driver || msg.sender == ride.passenger,
            "RideEscrow: not authorized"
        );

        ride.status = RideStatus.Disputed;
        emit DisputeOpened(rideId, msg.sender, evidenceHash);
    }

    /**
     * @notice Admin can release stuck escrows after 7 days.
     * @param rideIds Array of ride IDs to force-release.
     */
    function batchRelease(uint256[] calldata rideIds) external onlyRole(ADMIN_ROLE) nonReentrant {
        for (uint256 i = 0; i < rideIds.length; i++) {
            Ride storage ride = rides[rideIds[i]];
            require(
                block.timestamp >= ride.createdAt + STUCK_ESCROW_TIMEOUT,
                "RideEscrow: not expired yet"
            );
            if (ride.status == RideStatus.Booked || ride.status == RideStatus.Pickup) {
                ride.status = RideStatus.Cancelled;
                rideToken.transfer(ride.passenger, ride.fare);
            }
        }
    }

    /**
     * @notice Resolve a disputed ride (called by DisputeResolver).
     * @param rideId Ride to resolve.
     * @param resolution 1=refund passenger, 2=pay driver, 3=split 50/50.
     */
    function resolveDispute(uint256 rideId, uint8 resolution)
        external
        onlyRole(ADMIN_ROLE)
        nonReentrant
    {
        Ride storage ride = rides[rideId];
        require(ride.status == RideStatus.Disputed, "RideEscrow: not disputed");

        ride.status = RideStatus.Completed;
        ride.completedAt = block.timestamp;

        if (resolution == 1) {
            // Full refund to passenger
            rideToken.transfer(ride.passenger, ride.fare);
        } else if (resolution == 2) {
            // Full payment to driver
            rideToken.transfer(ride.driver, ride.driverPayout);
            rideToken.transfer(treasury, ride.platformFee);
        } else {
            // 50/50 split
            uint256 half = ride.fare / 2;
            rideToken.transfer(ride.passenger, half);
            rideToken.transfer(ride.driver, ride.fare - half);
        }
    }

    // ── View functions ─────────────────────────────────────────────

    function getDriverRides(address driver) external view returns (uint256[] memory) {
        return driverRideIds[driver];
    }

    function getPassengerRides(address passenger) external view returns (uint256[] memory) {
        return passengerRideIds[passenger];
    }

    // ── Admin ──────────────────────────────────────────────────────

    function pause() external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    function updateTreasury(address newTreasury) external onlyRole(ADMIN_ROLE) {
        require(newTreasury != address(0), "RideEscrow: zero address");
        treasury = newTreasury;
    }
}
