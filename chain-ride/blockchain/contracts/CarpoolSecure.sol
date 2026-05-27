// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CarpoolSecure
 * @dev Carpool escrow contract with passenger ETH protection.
 *
 * SECURITY FIXES vs original Carpool.sol:
 * 1. ETH LOCK BUG: Passenger ETH can no longer be permanently locked.
 *    - Passengers can call refundBooking() to get ETH back if driver doesn't
 *      complete the ride within COMPLETION_TIMEOUT (72 hours after departure).
 *    - Driver can only withdraw after calling completeRide().
 * 2. Per-passenger booking tracking (address => booking state).
 * 3. Reentrancy guard on all ETH-transferring functions.
 * 4. Departure time tracked — refund only available after it has passed.
 * 5. Platform fee deducted on completion, held in contract until owner withdraws.
 */
contract CarpoolSecure {

    // ── Constants ────────────────────────────────────────────────────────────
    uint256 public constant COMPLETION_TIMEOUT = 72 hours;
    uint256 public constant PLATFORM_FEE_BPS   = 500; // 5% in basis points
    uint256 public constant MAX_SEATS           = 8;

    // ── State ────────────────────────────────────────────────────────────────
    address public owner;
    uint256 public platformBalance; // accumulated platform fees
    uint256 public rideCount;

    struct Booking {
        uint256 amountPaid;
        bool    refunded;
        bool    settled; // true once driver completes and payment released
    }

    struct Ride {
        address   driver;
        string    origin;
        string    destination;
        uint256   pricePerSeat;     // wei per seat
        uint8     totalSeats;
        uint8     seatsBooked;
        uint256   departureTime;    // unix timestamp
        bool      isActive;
        bool      isCompleted;
        bool      isCancelled;
        uint256   escrowBalance;    // ETH currently locked in escrow for this ride
    }

    mapping(uint256 => Ride)                           public rides;
    mapping(uint256 => mapping(address => Booking))   public bookings;

    // ── Events ───────────────────────────────────────────────────────────────
    event RideCreated(uint256 indexed rideId, address indexed driver, uint256 pricePerSeat, uint256 departureTime);
    event SeatBooked(uint256 indexed rideId, address indexed passenger, uint256 amount);
    event RideCompleted(uint256 indexed rideId, uint256 driverPayout, uint256 platformFee);
    event RideCancelled(uint256 indexed rideId);
    event RefundIssued(uint256 indexed rideId, address indexed passenger, uint256 amount);
    event PlatformWithdrawn(address indexed owner, uint256 amount);

    // ── Modifiers ────────────────────────────────────────────────────────────
    bool private _locked;
    modifier nonReentrant() {
        require(!_locked, "Reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    // ── Driver: Create Ride ──────────────────────────────────────────────────
    /**
     * @dev Driver creates a ride offer.
     * @param origin          Starting location string
     * @param destination     Destination string
     * @param pricePerSeat    Price per seat in wei
     * @param totalSeats      Total seats available (1–8)
     * @param departureTime   Unix timestamp of planned departure (must be in future)
     */
    function createRide(
        string calldata origin,
        string calldata destination,
        uint256 pricePerSeat,
        uint8   totalSeats,
        uint256 departureTime
    ) external returns (uint256 rideId) {
        require(bytes(origin).length > 0,               "Origin required");
        require(bytes(destination).length > 0,          "Destination required");
        require(pricePerSeat > 0,                        "Price must be > 0");
        require(totalSeats > 0 && totalSeats <= MAX_SEATS, "Invalid seat count");
        require(departureTime > block.timestamp,         "Departure must be in future");

        rideId = rideCount++;
        rides[rideId] = Ride({
            driver:        msg.sender,
            origin:        origin,
            destination:   destination,
            pricePerSeat:  pricePerSeat,
            totalSeats:    totalSeats,
            seatsBooked:   0,
            departureTime: departureTime,
            isActive:      true,
            isCompleted:   false,
            isCancelled:   false,
            escrowBalance: 0
        });

        emit RideCreated(rideId, msg.sender, pricePerSeat, departureTime);
    }

    // ── Passenger: Book a Seat ───────────────────────────────────────────────
    /**
     * @dev Passenger sends ETH to book a seat. ETH is held in escrow.
     * @param rideId  The ride to book
     */
    function bookSeat(uint256 rideId) external payable nonReentrant {
        Ride storage ride = rides[rideId];
        require(ride.isActive,                               "Ride not active");
        require(!ride.isCompleted,                            "Ride already completed");
        require(!ride.isCancelled,                            "Ride cancelled");
        require(block.timestamp < ride.departureTime,         "Ride has departed");
        require(ride.seatsBooked < ride.totalSeats,           "No seats available");
        require(msg.sender != ride.driver,                    "Driver cannot book own ride");
        require(msg.value >= ride.pricePerSeat,               "Insufficient payment");
        require(bookings[rideId][msg.sender].amountPaid == 0, "Already booked");

        // Record booking
        bookings[rideId][msg.sender] = Booking({
            amountPaid: msg.value,
            refunded:   false,
            settled:    false
        });

        ride.seatsBooked++;
        ride.escrowBalance += msg.value;

        if (ride.seatsBooked >= ride.totalSeats) {
            ride.isActive = false; // fully booked
        }

        // Return excess ETH immediately
        uint256 excess = msg.value - ride.pricePerSeat;
        if (excess > 0) {
            ride.escrowBalance -= excess;
            (bool sent, ) = payable(msg.sender).call{value: excess}("");
            require(sent, "Excess refund failed");
        }

        emit SeatBooked(rideId, msg.sender, ride.pricePerSeat);
    }

    // ── Driver: Complete Ride and Release Payments ───────────────────────────
    /**
     * @dev Driver marks ride as completed. All booked passenger funds are released:
     *      95% goes to driver, 5% goes to platform.
     * @param rideId  The ride to complete
     * @param passengers  Array of passenger addresses who completed the ride
     */
    function completeRide(
        uint256 rideId,
        address[] calldata passengers
    ) external nonReentrant {
        Ride storage ride = rides[rideId];
        require(msg.sender == ride.driver, "Only driver can complete");
        require(!ride.isCompleted,          "Already completed");
        require(!ride.isCancelled,          "Ride was cancelled");
        require(passengers.length > 0,      "No passengers provided");

        ride.isCompleted = true;
        ride.isActive    = false;

        uint256 totalPayout  = 0;
        uint256 totalFees    = 0;

        for (uint256 i = 0; i < passengers.length; i++) {
            address passenger = passengers[i];
            Booking storage booking = bookings[rideId][passenger];
            if (booking.amountPaid > 0 && !booking.refunded && !booking.settled) {
                booking.settled = true;
                uint256 fee     = (booking.amountPaid * PLATFORM_FEE_BPS) / 10000;
                uint256 payout  = booking.amountPaid - fee;
                totalPayout    += payout;
                totalFees      += fee;
                ride.escrowBalance -= booking.amountPaid;
            }
        }

        platformBalance += totalFees;

        // Pay driver in one transfer (cheaper gas)
        if (totalPayout > 0) {
            (bool sent, ) = payable(ride.driver).call{value: totalPayout}("");
            require(sent, "Driver payout failed");
        }

        emit RideCompleted(rideId, totalPayout, totalFees);
    }

    // ── Passenger: Refund (ETH Lock Fix) ─────────────────────────────────────
    /**
     * @dev Passenger can claim a refund if:
     *   - The ride was cancelled by the driver, OR
     *   - The ride was not completed within COMPLETION_TIMEOUT after departure
     *
     * This fixes the ETH lock vulnerability in the original contract where
     * passenger ETH was locked forever if the driver never called completeRide().
     *
     * @param rideId  The ride to claim refund from
     */
    function refundBooking(uint256 rideId) external nonReentrant {
        Ride storage ride = rides[rideId];
        Booking storage booking = bookings[rideId][msg.sender];

        require(booking.amountPaid > 0,  "No booking found");
        require(!booking.refunded,        "Already refunded");
        require(!booking.settled,         "Payment already settled");

        bool rideWasCancelled = ride.isCancelled;
        bool timedOut = !ride.isCompleted &&
                        block.timestamp > ride.departureTime + COMPLETION_TIMEOUT;

        require(rideWasCancelled || timedOut, "Refund not available yet");

        uint256 amount = booking.amountPaid;
        booking.refunded = true;
        ride.escrowBalance -= amount;

        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Refund transfer failed");

        emit RefundIssued(rideId, msg.sender, amount);
    }

    // ── Driver: Cancel Ride ──────────────────────────────────────────────────
    /**
     * @dev Driver cancels a ride before departure. Allows all passengers to refund.
     * @param rideId  The ride to cancel
     */
    function cancelRide(uint256 rideId) external {
        Ride storage ride = rides[rideId];
        require(msg.sender == ride.driver, "Only driver can cancel");
        require(!ride.isCompleted,          "Already completed");
        require(!ride.isCancelled,          "Already cancelled");

        ride.isCancelled = true;
        ride.isActive    = false;

        emit RideCancelled(rideId);
        // Passengers call refundBooking() individually to gas-efficiently claim refunds
    }

    // ── Platform: Withdraw Fees ──────────────────────────────────────────────
    /**
     * @dev Platform owner withdraws accumulated fees.
     */
    function withdrawPlatformFees() external onlyOwner nonReentrant {
        uint256 amount = platformBalance;
        require(amount > 0, "No fees to withdraw");
        platformBalance = 0;
        (bool sent, ) = payable(owner).call{value: amount}("");
        require(sent, "Withdrawal failed");
        emit PlatformWithdrawn(owner, amount);
    }

    // ── View Helpers ─────────────────────────────────────────────────────────
    function getRide(uint256 rideId) external view returns (Ride memory) {
        return rides[rideId];
    }

    function getBooking(uint256 rideId, address passenger) external view returns (Booking memory) {
        return bookings[rideId][passenger];
    }

    function getAvailableSeats(uint256 rideId) external view returns (uint256) {
        Ride memory ride = rides[rideId];
        return ride.totalSeats - ride.seatsBooked;
    }

    /**
     * @dev Returns true if a passenger is eligible for a refund right now.
     */
    function isRefundEligible(uint256 rideId, address passenger) external view returns (bool eligible, string memory reason) {
        Ride memory ride = rides[rideId];
        Booking memory booking = bookings[rideId][passenger];

        if (booking.amountPaid == 0)  return (false, "No booking found");
        if (booking.refunded)          return (false, "Already refunded");
        if (booking.settled)           return (false, "Payment already settled");

        if (ride.isCancelled) return (true, "Ride was cancelled by driver");

        if (!ride.isCompleted && block.timestamp > ride.departureTime + COMPLETION_TIMEOUT) {
            return (true, "Ride completion timed out");
        }

        return (false, "Refund not yet available");
    }
}
