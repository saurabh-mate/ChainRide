// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Reputation {
    struct UserRating {
        uint256 totalScore;
        uint256 reviewCount;
    }

    mapping(address => UserRating) public ratings;

    event RatingAdded(address indexed user, uint256 score, address indexed reviewer);

    function addRating(address _user, uint256 _score) external {
        require(_score >= 1 && _score <= 5, "Score must be between 1 and 5");
        
        ratings[_user].totalScore += _score;
        ratings[_user].reviewCount += 1;

        emit RatingAdded(_user, _score, msg.sender);
    }

    function getAverageRating(address _user) external view returns (uint256) {
        if (ratings[_user].reviewCount == 0) return 0;
        // Returns average multiplied by 10 to keep 1 decimal precision (e.g., 45 = 4.5)
        return (ratings[_user].totalScore * 10) / ratings[_user].reviewCount;
    }
}
