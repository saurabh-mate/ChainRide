// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title RideToken
 * @author RideChain
 * @notice ERC-20 utility token for the RideChain platform.
 * @dev Max supply: 1 billion RIDE. 
 *      Uses AccessControl roles for minting, pausing, and airdrops.
 */
contract RideToken is ERC20, ERC20Burnable, ERC20Permit, ERC20Pausable, ERC20Votes, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant AIRDROP_ROLE = keccak256("AIRDROP_ROLE");

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18; // 1 billion RIDE

    /**
     * @notice Constructor mints no tokens — all minting via roles.
     * @param admin The address with DEFAULT_ADMIN_ROLE and initial roles.
     */
    constructor(address admin) ERC20("RideChain Token", "RIDE") ERC20Permit("RideChain Token") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(AIRDROP_ROLE, admin);
    }

    /**
     * @notice Mint new RIDE tokens.
     * @param to Recipient address.
     * @param amount Amount in wei (18 decimals).
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "RideToken: exceeds max supply");
        _mint(to, amount);
    }

    /**
     * @notice Batch airdrop RIDE tokens to multiple addresses.
     * @param recipients Array of recipient addresses.
     * @param amounts Array of amounts (must match recipients length).
     */
    function airdropBatch(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyRole(AIRDROP_ROLE) {
        require(recipients.length == amounts.length, "RideToken: length mismatch");
        require(recipients.length <= 200, "RideToken: batch too large");
        uint256 totalAmount;
        for (uint256 i = 0; i < recipients.length; i++) {
            totalAmount += amounts[i];
        }
        require(totalSupply() + totalAmount <= MAX_SUPPLY, "RideToken: exceeds max supply");

        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
        }
    }

    /**
     * @notice Pause all token transfers (emergency circuit breaker).
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause all token transfers.
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ── Required overrides ─────────────────────────────────────────────
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function _mint(address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._mint(to, amount);
    }

    function _burn(address from, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._burn(from, amount);
    }
}
