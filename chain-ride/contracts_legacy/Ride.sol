// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Payment.sol";
import "./Reputation.sol";

contract Ride is Payment {
    enum RideState { Created, Accepted, InProgress, Completed, Cancelled }

    struct RideDetails {
        address payable passenger;
        address payable driver;
        uint256 fare;
        RideState state;
        string startLocation; // Can be geohash or simple string for demo
        string endLocation;
    }

    mapping(uint256 => RideDetails) public rides;
    uint256 public rideCounter;
    Reputation public reputationContract;

    event RideCreated(uint256 indexed rideId, address indexed passenger, uint256 fare);
    event RideAccepted(uint256 indexed rideId, address indexed driver);
    event RideCompleted(uint256 indexed rideId);
    event RideCancelled(uint256 indexed rideId);

    constructor(address _reputationContractAddress) {
        reputationContract = Reputation(_reputationContractAddress);
    }

    // Passenger creates a ride and locks funds
    function createRide(string memory _startLocation, string memory _endLocation) external payable {
        require(msg.value > 0, "Fare must be greater than 0");

        rideCounter++;
        rides[rideCounter] = RideDetails({
            passenger: payable(msg.sender),
            driver: payable(address(0)),
            fare: msg.value,
            state: RideState.Created,
            startLocation: _startLocation,
            endLocation: _endLocation
        });

        emit RideCreated(rideCounter, msg.sender, msg.value);
    }

    // Driver accepts the ride
    function acceptRide(uint256 _rideId) external {
        RideDetails storage ride = rides[_rideId];
        require(ride.state == RideState.Created, "Ride not available");
        require(msg.sender != ride.passenger, "Passenger cannot be driver");

        // Simple check on reputation (optional logic here)
        uint256 driverRating = reputationContract.getAverageRating(msg.sender);
        // Could enforce minimum rating requirements

        ride.driver = payable(msg.sender);
        ride.state = RideState.Accepted;

        emit RideAccepted(_rideId, msg.sender);
    }

    // Passenger or Driver marks ride in progress
    function startRide(uint256 _rideId) external {
        RideDetails storage ride = rides[_rideId];
        require(ride.state == RideState.Accepted, "Ride not accepted");
        require(msg.sender == ride.passenger || msg.sender == ride.driver, "Not authorized");

        ride.state = RideState.InProgress;
    }

    // Passenger completes the ride
    function completeRide(uint256 _rideId, uint256 _driverRating) external {
        RideDetails storage ride = rides[_rideId];
        require(ride.state == RideState.InProgress, "Ride not in progress");
        require(msg.sender == ride.passenger, "Only passenger can complete");

        ride.state = RideState.Completed;

        // Rate the driver
        if (_driverRating > 0) {
            reputationContract.addRating(ride.driver, _driverRating);
        }

        // Release payment using inherited Payment contract logic
        _releasePayment(ride.driver, ride.fare);

        emit RideCompleted(_rideId);
    }

    // Passenger can cancel before accepted
    function cancelRide(uint256 _rideId) external {
        RideDetails storage ride = rides[_rideId];
        require(ride.state == RideState.Created, "Cannot cancel now");
        require(msg.sender == ride.passenger, "Only passenger can cancel");

        ride.state = RideState.Cancelled;
        
        // Refund passenger
        ride.passenger.transfer(ride.fare);

        emit RideCancelled(_rideId);
    }
}
