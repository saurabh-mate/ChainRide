// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./RideToken.sol";
import "./FeeManager.sol";

/**
 * @title CarpoolOffer
 * @author RideChain
 * @notice BlaBlaCar-mode journey posting and seat booking.
 * @dev Drivers post journeys, passengers book seats.
 *      Funds escrowed in this contract. 50% released on departure,
 *      50% on completion.
 */
contract CarpoolOffer is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    RideToken  public rideToken;
    FeeManager public feeManager;
    address    public treasury;

    uint256 public offerCounter;

    enum OfferStatus { Open, Full, Departed, Completed, Cancelled }

    struct Offer {
        uint256 offerId;
        address driver;
        string  fromCity;
        string  toCity;
        uint256 departureTime;
        uint8   totalSeats;
        uint8   availableSeats;
        uint256 pricePerSeat;       // in RIDE wei
        uint8   luggagePolicy;      // 0=none, 1=small, 2=large
        bool    petsAllowed;
        bool    smokingAllowed;
        OfferStatus status;
        bytes32 routeIPFSHash;
    }

    struct Booking {
        address passenger;
        uint8   seats;
        uint256 totalPaid;          // seats × pricePerSeat
        bool    hasBoarded;
        bool    refunded;
    }

    mapping(uint256 => Offer)      public offers;
    mapping(uint256 => Booking[])  public offerBookings;
    mapping(uint256 => mapping(address => uint256)) public passengerBookingIndex;
    mapping(uint256 => bool)       public halfReleased; // 50% released on departure

    // ── Events ─────────────────────────────────────────────────────
    event OfferCreated(uint256 indexed offerId, address indexed driver, string from, string to, uint256 departure);
    event SeatsBooked(uint256 indexed offerId, address indexed passenger, uint8 seats, uint256 totalPaid);
    event BookingCancelled(uint256 indexed offerId, address indexed passenger, uint256 refundAmount);
    event OfferDeparted(uint256 indexed offerId, uint256 timestamp);
    event OfferCompleted(uint256 indexed offerId, uint256 totalDriverPayout);
    event OfferCancelled(uint256 indexed offerId);

    constructor(
        address _rideToken,
        address _feeManager,
        address _treasury,
        address _admin
    ) {
        rideToken  = RideToken(_rideToken);
        feeManager = FeeManager(_feeManager);
        treasury   = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
    }

    /**
     * @notice Driver creates a carpool journey offer.
     */
    function createOffer(
        string calldata fromCity,
        string calldata toCity,
        uint256 departureTime,
        uint8 totalSeats,
        uint256 pricePerSeat,
        uint8 luggagePolicy,
        bool petsAllowed,
        bool smokingAllowed,
        bytes32 routeIPFSHash
    ) external returns (uint256) {
        require(totalSeats >= 1 && totalSeats <= 8, "CarpoolOffer: seats 1-8");
        require(pricePerSeat >= 1 ether, "CarpoolOffer: min 1 RIDE per seat");
        require(pricePerSeat <= 1000 ether, "CarpoolOffer: max 1000 RIDE per seat");
        require(departureTime > block.timestamp, "CarpoolOffer: must be in future");

        offerCounter++;
        uint256 offerId = offerCounter;

        offers[offerId] = Offer({
            offerId: offerId,
            driver: msg.sender,
            fromCity: fromCity,
            toCity: toCity,
            departureTime: departureTime,
            totalSeats: totalSeats,
            availableSeats: totalSeats,
            pricePerSeat: pricePerSeat,
            luggagePolicy: luggagePolicy,
            petsAllowed: petsAllowed,
            smokingAllowed: smokingAllowed,
            status: OfferStatus.Open,
            routeIPFSHash: routeIPFSHash
        });

        emit OfferCreated(offerId, msg.sender, fromCity, toCity, departureTime);
        return offerId;
    }

    /**
     * @notice Passenger books seats on an offer.
     * @param offerId The offer to book.
     * @param numSeats Number of seats to book.
     */
    function bookSeats(uint256 offerId, uint8 numSeats) external nonReentrant {
        Offer storage offer = offers[offerId];
        require(offer.status == OfferStatus.Open, "CarpoolOffer: not open");
        require(numSeats >= 1 && numSeats <= offer.availableSeats, "CarpoolOffer: invalid seats");
        require(msg.sender != offer.driver, "CarpoolOffer: driver cannot book own offer");

        uint256 totalCost = uint256(numSeats) * offer.pricePerSeat;

        // Transfer RIDE from passenger to contract (escrow)
        require(
            rideToken.transferFrom(msg.sender, address(this), totalCost),
            "CarpoolOffer: transfer failed"
        );

        offerBookings[offerId].push(Booking({
            passenger: msg.sender,
            seats: numSeats,
            totalPaid: totalCost,
            hasBoarded: false,
            refunded: false
        }));
        passengerBookingIndex[offerId][msg.sender] = offerBookings[offerId].length - 1;

        offer.availableSeats -= numSeats;
        if (offer.availableSeats == 0) {
            offer.status = OfferStatus.Full;
        }

        emit SeatsBooked(offerId, msg.sender, numSeats, totalCost);
    }

    /**
     * @notice Passenger cancels booking with time-based refund rules.
     */
    function cancelBooking(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        require(
            offer.status == OfferStatus.Open || offer.status == OfferStatus.Full,
            "CarpoolOffer: cannot cancel"
        );

        uint256 bookingIdx = passengerBookingIndex[offerId][msg.sender];
        Booking storage booking = offerBookings[offerId][bookingIdx];
        require(booking.passenger == msg.sender, "CarpoolOffer: not your booking");
        require(!booking.refunded, "CarpoolOffer: already refunded");

        uint256 timeUntilDeparture = 0;
        if (offer.departureTime > block.timestamp) {
            timeUntilDeparture = offer.departureTime - block.timestamp;
        }

        uint256 refundAmount;
        if (timeUntilDeparture > 24 hours) {
            refundAmount = booking.totalPaid; // 100% refund
        } else if (timeUntilDeparture > 2 hours) {
            refundAmount = booking.totalPaid / 2; // 50% refund
        } else {
            refundAmount = 0; // 0% refund — driver keeps payment
        }

        booking.refunded = true;
        offer.availableSeats += booking.seats;
        if (offer.status == OfferStatus.Full) {
            offer.status = OfferStatus.Open;
        }

        if (refundAmount > 0) {
            rideToken.transfer(msg.sender, refundAmount);
        }
        // Remainder stays in escrow and goes to driver on completion
        uint256 driverKeeps = booking.totalPaid - refundAmount;
        if (driverKeeps > 0) {
            (uint256 fee, uint256 driverGets) = feeManager.calculateCarpoolFee(driverKeeps);
            rideToken.transfer(offer.driver, driverGets);
            rideToken.transfer(treasury, fee);
        }

        emit BookingCancelled(offerId, msg.sender, refundAmount);
    }

    /**
     * @notice Driver confirms departure. Releases 50% of escrowed funds.
     */
    function departOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        require(msg.sender == offer.driver, "CarpoolOffer: not driver");
        require(
            offer.status == OfferStatus.Open || offer.status == OfferStatus.Full,
            "CarpoolOffer: invalid status"
        );

        offer.status = OfferStatus.Departed;
        halfReleased[offerId] = true;

        // Release 50% of all active bookings to driver
        uint256 totalRelease;
        Booking[] storage bookings = offerBookings[offerId];
        for (uint256 i = 0; i < bookings.length; i++) {
            if (!bookings[i].refunded) {
                totalRelease += bookings[i].totalPaid / 2;
            }
        }

        if (totalRelease > 0) {
            (uint256 fee, uint256 driverGets) = feeManager.calculateCarpoolFee(totalRelease);
            rideToken.transfer(offer.driver, driverGets);
            rideToken.transfer(treasury, fee);
        }

        emit OfferDeparted(offerId, block.timestamp);
    }

    /**
     * @notice Driver marks journey complete. Releases remaining 50%.
     */
    function completeOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        require(msg.sender == offer.driver, "CarpoolOffer: not driver");
        require(offer.status == OfferStatus.Departed, "CarpoolOffer: not departed");

        offer.status = OfferStatus.Completed;

        // Release remaining 50%
        uint256 totalRelease;
        Booking[] storage bookings = offerBookings[offerId];
        for (uint256 i = 0; i < bookings.length; i++) {
            if (!bookings[i].refunded) {
                totalRelease += bookings[i].totalPaid - (bookings[i].totalPaid / 2); // remaining half
            }
        }

        if (totalRelease > 0) {
            (uint256 fee, uint256 driverGets) = feeManager.calculateCarpoolFee(totalRelease);
            rideToken.transfer(offer.driver, driverGets);
            rideToken.transfer(treasury, fee);
        }

        emit OfferCompleted(offerId, totalRelease);
    }

    /**
     * @notice Driver cancels the entire offer. Full refund to all passengers.
     */
    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        require(msg.sender == offer.driver, "CarpoolOffer: not driver");
        require(
            offer.status == OfferStatus.Open || offer.status == OfferStatus.Full,
            "CarpoolOffer: cannot cancel"
        );

        offer.status = OfferStatus.Cancelled;

        // Refund all non-refunded bookings
        Booking[] storage bookings = offerBookings[offerId];
        for (uint256 i = 0; i < bookings.length; i++) {
            if (!bookings[i].refunded) {
                bookings[i].refunded = true;
                rideToken.transfer(bookings[i].passenger, bookings[i].totalPaid);
            }
        }

        emit OfferCancelled(offerId);
    }

    // ── View functions ─────────────────────────────────────────────

    function getOfferBookings(uint256 offerId) external view returns (Booking[] memory) {
        return offerBookings[offerId];
    }

    function getBookingCount(uint256 offerId) external view returns (uint256) {
        return offerBookings[offerId].length;
    }
}
