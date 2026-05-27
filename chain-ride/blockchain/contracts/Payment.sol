// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Payment {
    address public platformOwner;
    uint256 public platformFeePercentage = 5; // 5% fee

    event PaymentReleased(address indexed driver, uint256 amount, uint256 platformFee);

    constructor() {
        platformOwner = msg.sender;
    }

    function _releasePayment(address payable _driver, uint256 _amount) internal {
        uint256 platformFee = (_amount * platformFeePercentage) / 100;
        uint256 driverPayout = _amount - platformFee;

        // Transfer fee to platform
        payable(platformOwner).transfer(platformFee);
        // Transfer payout to driver
        _driver.transfer(driverPayout);

        emit PaymentReleased(_driver, driverPayout, platformFee);
    }

    function setPlatformFee(uint256 _newFee) external {
        require(msg.sender == platformOwner, "Only owner can set fee");
        require(_newFee <= 20, "Fee too high");
        platformFeePercentage = _newFee;
    }
}
