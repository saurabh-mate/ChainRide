// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Carpool
 * @dev A simple carpool system smart contract for creating and completing rides
 */
contract Carpool {
    struct Ride {
        address driver;
        string origin;
        string destination;
        uint256 price;
        uint8 seatsAvailable;
        uint8 seatsBooked;
        bool isActive;
        bool isCompleted;
    }

    uint256 public rideCount;
    mapping(uint256 => Ride) public rides;

    event RideCreated(uint256 indexed rideId, address indexed driver, string origin, string destination, uint256 price);
    event RideBooked(uint256 indexed rideId, address indexed passenger);
    event RideCompleted(uint256 indexed rideId);

    /**
     * @dev Create a new ride offer
     * @param origin The starting location
     * @param destination The destination
     * @param price The price per seat in wei
     * @param seatsAvailable Total seats available
     */
    function createRide(
        string calldata origin,
        string calldata destination,
        uint256 price,
        uint8 seatsAvailable
    ) external returns (uint256) {
        require(bytes(origin).length > 0, "Origin required");
        require(bytes(destination).length > 0, "Destination required");
        require(price > 0, "Price must be greater than 0");
        require(seatsAvailable > 0 && seatsAvailable <= 8, "Invalid seats");

        uint256 rideId = rideCount++;
        rides[rideId] = Ride({
            driver: msg.sender,
            origin: origin,
            destination: destination,
            price: price,
            seatsAvailable: seatsAvailable,
            seatsBooked: 0,
            isActive: true,
            isCompleted: false
        });

        emit RideCreated(rideId, msg.sender, origin, destination, price);
        return rideId;
    }

    /**
     * @dev Book a seat on a ride
     * @param rideId The ID of the ride to book
     */
    function bookRide(uint256 rideId) external payable {
        Ride storage ride = rides[rideId];
        require(ride.isActive, "Ride not active");
        require(!ride.isCompleted, "Ride completed");
        require(ride.seatsBooked < ride.seatsAvailable, "No seats available");
        require(msg.value >= ride.price, "Insufficient payment");

        ride.seatsBooked++;

        if (ride.seatsBooked >= ride.seatsAvailable) {
            ride.isActive = false;
        }

        emit RideBooked(rideId, msg.sender);

        // Return excess payment
        if (msg.value > ride.price) {
            payable(msg.sender).transfer(msg.value - ride.price);
        }
    }

    /**
     * @dev Mark a ride as completed (only driver can call)
     * @param rideId The ID of the ride to complete
     */
    function completeRide(uint256 rideId) external {
        Ride storage ride = rides[rideId];
        require(msg.sender == ride.driver, "Only driver can complete");
        require(!ride.isCompleted, "Already completed");

        ride.isCompleted = true;
        ride.isActive = false;

        emit RideCompleted(rideId);
    }

    /**
     * @dev Get ride details
     * @param rideId The ID of the ride
     */
    function getRide(uint256 rideId) external view returns (Ride memory) {
        return rides[rideId];
    }

    /**
     * @dev Get available seats for a ride
     * @param rideId The ID of the ride
     */
    function getAvailableSeats(uint256 rideId) external view returns (uint8) {
        return rides[rideId].seatsAvailable - rides[rideId].seatsBooked;
    }
}