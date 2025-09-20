// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract RideSharing {
    struct Ride {
        address driver;
        address passenger;
        uint256 fare;
        bool active;
    }

    mapping(uint256 => Ride) public rides;
    uint256 public rideIndex;

    event RideStarted(uint256 rideId, address indexed driver, address indexed passenger, uint256 fare);
    event RideCompleted(uint256 rideId, address indexed driver, address indexed passenger, uint256 fare);

    function startRide(address _passenger, uint256 _fare) external {
        require(msg.sender != _passenger, "Driver and passenger cannot be the same");
        rideIndex++;
        rides[rideIndex] = Ride(msg.sender, _passenger, _fare, true);
        emit RideStarted(rideIndex, msg.sender, _passenger, _fare);
    }

    function completeRide(uint256 _rideId) external payable {
        Ride storage ride = rides[_rideId];
        require(ride.active, "Ride is not active");
        require(msg.sender == ride.driver, "Only driver can complete the ride");
        require(msg.value == ride.fare, "Incorrect fare amount");
        payable(ride.driver).transfer(msg.value);
        ride.active = false;
        emit RideCompleted(_rideId, ride.driver, ride.passenger, ride.fare);
    }
}
