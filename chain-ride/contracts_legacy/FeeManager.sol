// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title FeeManager
 * @author RideChain
 * @notice Single source of truth for all platform fee rates.
 * @dev All fee values in basis points (100 = 1.00%).
 *      Fee updates are restricted to GOVERNOR_ROLE (the DAO timelock).
 */
contract FeeManager is AccessControl {
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");

    // ── Fee parameters (basis points, 10000 = 100%) ────────────────
    uint256 public platformFeePercent = 200;     // 2.00%
    uint256 public carpoolFeePercent = 150;      // 1.50%
    uint256 public cancellationFee = 2 ether;    // 2 RIDE flat
    uint256 public maxSurgeMultiplier = 500;     // 5.00x (in 100ths)
    uint256 public baseFarePerKm = 0.5 ether;    // 0.5 RIDE per km
    uint256 public baseFareFlat = 1 ether;       // 1 RIDE flat booking fee

    // ── Loyalty tier discounts (basis points off platform fee) ──────
    // 0=bronze, 1=silver, 2=gold, 3=platinum
    mapping(uint8 => uint256) public loyaltyDiscounts;

    // ── Vehicle type multipliers (100 = 1.00x) ─────────────────────
    // 0=economy, 1=comfort, 2=xl, 3=electric, 4=luxury
    mapping(uint8 => uint256) public vehicleMultipliers;

    // ── Events ─────────────────────────────────────────────────────
    event FeeUpdated(bytes32 indexed feeType, uint256 oldValue, uint256 newValue);
    event SurgeActivated(string zone, uint256 multiplier);

    /**
     * @param admin Address with DEFAULT_ADMIN_ROLE.
     */
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNOR_ROLE, admin); // Initially admin, transferred to DAO later

        // Default loyalty discounts
        loyaltyDiscounts[0] = 0;     // Bronze:   0%
        loyaltyDiscounts[1] = 500;   // Silver:   5% (500 bp)
        loyaltyDiscounts[2] = 1000;  // Gold:    10%
        loyaltyDiscounts[3] = 1500;  // Platinum: 15%

        // Default vehicle multipliers (100 = 1.0x)
        vehicleMultipliers[0] = 100;  // Economy
        vehicleMultipliers[1] = 130;  // Comfort
        vehicleMultipliers[2] = 160;  // XL
        vehicleMultipliers[3] = 110;  // Electric
        vehicleMultipliers[4] = 200;  // Luxury
    }

    /**
     * @notice Calculate the fare for an on-demand ride.
     * @param distanceMeters Route distance in meters.
     * @param vehicleType 0=economy, 1=comfort, 2=xl, 3=electric, 4=luxury.
     * @param loyaltyTier Passenger's loyalty tier (0–3).
     * @param surgeMultiplier Surge in basis points (100 = 1.0x, 150 = 1.5x).
     * @return totalFare Charged to passenger.
     * @return platformFeeAmount Platform's cut.
     * @return driverPayout Amount the driver receives.
     */
    function calculateFare(
        uint256 distanceMeters,
        uint8 vehicleType,
        uint8 loyaltyTier,
        uint256 surgeMultiplier
    ) external view returns (
        uint256 totalFare,
        uint256 platformFeeAmount,
        uint256 driverPayout
    ) {
        require(surgeMultiplier >= 100, "FeeManager: surge minimum is 1.0x");
        require(surgeMultiplier <= maxSurgeMultiplier, "FeeManager: exceeds max surge");

        uint256 distanceKm = distanceMeters / 1000; // integer km
        uint256 baseFare = baseFareFlat + (distanceKm * baseFarePerKm);

        // Apply vehicle multiplier
        uint256 vMult = vehicleMultipliers[vehicleType];
        if (vMult == 0) vMult = 100; // fallback to 1.0x
        uint256 preSurgeFare = (baseFare * vMult) / 100;

        // Apply surge
        uint256 postSurgeFare = (preSurgeFare * surgeMultiplier) / 100;

        // Apply loyalty discount (discount applies to platform fee portion only)
        uint256 rawPlatformFee = (postSurgeFare * platformFeePercent) / 10000;
        uint256 discount = (rawPlatformFee * loyaltyDiscounts[loyaltyTier]) / 10000;
        platformFeeAmount = rawPlatformFee - discount;

        totalFare = postSurgeFare;
        driverPayout = totalFare - platformFeeAmount;
    }

    /**
     * @notice Calculate carpool fee for a seat booking.
     * @param pricePerSeat Price set by the driver.
     * @return fee Platform's cut from the seat price.
     * @return driverReceives Amount driver gets per seat.
     */
    function calculateCarpoolFee(uint256 pricePerSeat) external view returns (
        uint256 fee,
        uint256 driverReceives
    ) {
        fee = (pricePerSeat * carpoolFeePercent) / 10000;
        driverReceives = pricePerSeat - fee;
    }

    // ── Fee update functions (GOVERNOR_ROLE only) ──────────────────

    function setPlatformFee(uint256 newFee) external onlyRole(GOVERNOR_ROLE) {
        require(newFee <= 1000, "FeeManager: max 10%");
        emit FeeUpdated("platformFee", platformFeePercent, newFee);
        platformFeePercent = newFee;
    }

    function setCarpoolFee(uint256 newFee) external onlyRole(GOVERNOR_ROLE) {
        require(newFee <= 1000, "FeeManager: max 10%");
        emit FeeUpdated("carpoolFee", carpoolFeePercent, newFee);
        carpoolFeePercent = newFee;
    }

    function setCancellationFee(uint256 newFee) external onlyRole(GOVERNOR_ROLE) {
        emit FeeUpdated("cancellationFee", cancellationFee, newFee);
        cancellationFee = newFee;
    }

    function setMaxSurge(uint256 newMax) external onlyRole(GOVERNOR_ROLE) {
        require(newMax >= 100 && newMax <= 1000, "FeeManager: range 1x-10x");
        emit FeeUpdated("maxSurge", maxSurgeMultiplier, newMax);
        maxSurgeMultiplier = newMax;
    }

    function setBaseFarePerKm(uint256 newFare) external onlyRole(GOVERNOR_ROLE) {
        emit FeeUpdated("baseFarePerKm", baseFarePerKm, newFare);
        baseFarePerKm = newFare;
    }

    function setBaseFareFlat(uint256 newFare) external onlyRole(GOVERNOR_ROLE) {
        emit FeeUpdated("baseFareFlat", baseFareFlat, newFare);
        baseFareFlat = newFare;
    }

    function setLoyaltyDiscount(uint8 tier, uint256 discount) external onlyRole(GOVERNOR_ROLE) {
        require(tier <= 3, "FeeManager: invalid tier");
        require(discount <= 5000, "FeeManager: max 50% discount");
        loyaltyDiscounts[tier] = discount;
    }

    function setVehicleMultiplier(uint8 vehicleType, uint256 multiplier) external onlyRole(GOVERNOR_ROLE) {
        require(multiplier >= 50 && multiplier <= 500, "FeeManager: range 0.5x-5.0x");
        vehicleMultipliers[vehicleType] = multiplier;
    }
}
