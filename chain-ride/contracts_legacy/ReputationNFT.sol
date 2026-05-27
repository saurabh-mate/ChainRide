// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ReputationNFT
 * @author RideChain
 * @notice Soulbound ERC-721 NFT for on-chain reputation tracking.
 * @dev Each wallet gets exactly ONE non-transferable NFT.
 *      Stores ride count, rating points, loyalty tier, and badge IDs.
 */
contract ReputationNFT is ERC721, AccessControl {
    bytes32 public constant PLATFORM_ROLE = keccak256("PLATFORM_ROLE");
    bytes32 public constant ESCROW_ROLE = keccak256("ESCROW_ROLE");

    uint256 private _nextTokenId = 1;

    // ── Badge IDs ──────────────────────────────────────────────────
    // 1=First Ride, 2=10 Rides, 3=50 Rides, 4=100 Rides, 5=500 Rides
    // 6=5-Star Streak, 7=Early Adopter, 8=Eco Warrior
    // 9=Carbon Saver, 10=Verified Driver, 11=Super Driver

    struct Reputation {
        uint256 totalRides;
        uint256 totalRatingPoints;    // sum of (stars × 100)
        uint256 totalRatingsCount;
        uint8 loyaltyTier;            // 0=bronze 1=silver 2=gold 3=platinum
        string metadataIPFSHash;       // avatar, bio etc.
        bool isDriver;
        bool isVerified;
        uint256 consecutiveFiveStars;  // for 5-star streak badge
    }

    mapping(uint256 => Reputation) public reputations;
    mapping(uint256 => uint256[]) public tokenBadges;
    mapping(address => uint256) public walletToTokenId;

    // ── Events ─────────────────────────────────────────────────────
    event ReputationMinted(address indexed wallet, uint256 indexed tokenId);
    event RideRecorded(uint256 indexed tokenId, uint8 stars, bool asDriver);
    event BadgeAwarded(uint256 indexed tokenId, uint256 badgeId);
    event MetadataUpdated(uint256 indexed tokenId, string ipfsHash);
    event LoyaltyTierUpgraded(uint256 indexed tokenId, uint8 newTier);

    constructor(address admin) ERC721("RideChain Reputation", "RIDEREP") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PLATFORM_ROLE, admin);
    }

    // ── Soulbound: block all transfers ─────────────────────────────
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        // Allow minting (from == address(0)) but block transfers
        if (from != address(0) && to != address(0)) {
            revert("ReputationNFT: soulbound, non-transferable");
        }
        return super._update(to, tokenId, auth);
    }

    /**
     * @notice Mint a reputation NFT for a new user.
     * @param to Wallet address of the new user.
     * @return tokenId The minted token ID.
     */
    function mint(address to) external onlyRole(PLATFORM_ROLE) returns (uint256) {
        require(walletToTokenId[to] == 0, "ReputationNFT: already minted");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        walletToTokenId[to] = tokenId;

        reputations[tokenId] = Reputation({
            totalRides: 0,
            totalRatingPoints: 0,
            totalRatingsCount: 0,
            loyaltyTier: 0,
            metadataIPFSHash: "",
            isDriver: false,
            isVerified: false,
            consecutiveFiveStars: 0
        });

        // Award badge #1 (First Ride) will be given on first ride completion
        emit ReputationMinted(to, tokenId);
        return tokenId;
    }

    /**
     * @notice Record a completed ride and rating.
     * @param tokenId The reputation NFT token ID.
     * @param stars Rating given (1–5).
     * @param asDriver Whether this ride was completed as a driver.
     */
    function recordRide(uint256 tokenId, uint8 stars, bool asDriver)
        external
        onlyRole(ESCROW_ROLE)
    {
        require(_ownerOf(tokenId) != address(0), "ReputationNFT: invalid token");
        require(stars >= 1 && stars <= 5, "ReputationNFT: stars 1-5");

        Reputation storage rep = reputations[tokenId];
        rep.totalRides++;
        rep.totalRatingPoints += uint256(stars) * 100;
        rep.totalRatingsCount++;

        if (asDriver) {
            rep.isDriver = true;
        }

        // Track consecutive 5-star rides
        if (stars == 5) {
            rep.consecutiveFiveStars++;
        } else {
            rep.consecutiveFiveStars = 0;
        }

        // ── Auto-award badges ──────────────────────────────────────
        _checkAndAwardBadge(tokenId, rep);

        // ── Recalculate loyalty tier ───────────────────────────────
        _updateLoyaltyTier(tokenId, rep);

        emit RideRecorded(tokenId, stars, asDriver);
    }

    /**
     * @notice Update profile metadata (avatar, bio).
     * @param tokenId Token to update.
     * @param ipfsHash New IPFS hash for metadata.
     */
    function updateMetadata(uint256 tokenId, string calldata ipfsHash) external {
        require(ownerOf(tokenId) == msg.sender, "ReputationNFT: not owner");
        reputations[tokenId].metadataIPFSHash = ipfsHash;
        emit MetadataUpdated(tokenId, ipfsHash);
    }

    /**
     * @notice Mark a user as a verified driver.
     * @param tokenId Token to verify.
     */
    function setDriverVerified(uint256 tokenId) external onlyRole(PLATFORM_ROLE) {
        reputations[tokenId].isVerified = true;
        _awardBadge(tokenId, 10); // Badge: Verified Driver
    }

    /**
     * @notice Manually award a badge.
     * @param tokenId Token to award badge to.
     * @param badgeId Badge identifier.
     */
    function awardBadge(uint256 tokenId, uint256 badgeId) external onlyRole(PLATFORM_ROLE) {
        _awardBadge(tokenId, badgeId);
    }

    /**
     * @notice Get the average rating for a token (× 100 for 2 decimal precision).
     * @param tokenId Token to query.
     * @return Average rating × 100 (e.g. 450 = 4.50 stars).
     */
    function getAverageRating(uint256 tokenId) external view returns (uint256) {
        Reputation storage rep = reputations[tokenId];
        if (rep.totalRatingsCount == 0) return 500; // Default 5.0 for new users
        return rep.totalRatingPoints / rep.totalRatingsCount;
    }

    /**
     * @notice Get all badges for a token.
     */
    function getBadges(uint256 tokenId) external view returns (uint256[] memory) {
        return tokenBadges[tokenId];
    }

    /**
     * @notice Get the token ID for a wallet address.
     */
    function getTokenId(address wallet) external view returns (uint256) {
        return walletToTokenId[wallet];
    }

    // ── Internal helpers ───────────────────────────────────────────

    function _checkAndAwardBadge(uint256 tokenId, Reputation storage rep) internal {
        uint256 rides = rep.totalRides;

        if (rides == 1)   _awardBadge(tokenId, 1);   // First Ride
        if (rides == 10)  _awardBadge(tokenId, 2);   // 10 Rides
        if (rides == 50)  _awardBadge(tokenId, 3);   // 50 Rides
        if (rides == 100) _awardBadge(tokenId, 4);   // 100 Rides
        if (rides == 500) _awardBadge(tokenId, 5);   // 500 Rides

        if (rep.consecutiveFiveStars == 5) {
            _awardBadge(tokenId, 6); // 5-Star Streak
        }
    }

    function _updateLoyaltyTier(uint256 tokenId, Reputation storage rep) internal {
        uint8 oldTier = rep.loyaltyTier;
        uint8 newTier;

        if (rep.totalRides >= 200) newTier = 3;      // Platinum
        else if (rep.totalRides >= 50) newTier = 2;   // Gold
        else if (rep.totalRides >= 10) newTier = 1;   // Silver
        else newTier = 0;                              // Bronze

        if (newTier > oldTier) {
            rep.loyaltyTier = newTier;
            emit LoyaltyTierUpgraded(tokenId, newTier);
        }
    }

    function _awardBadge(uint256 tokenId, uint256 badgeId) internal {
        // Check if badge already awarded
        uint256[] storage badges = tokenBadges[tokenId];
        for (uint256 i = 0; i < badges.length; i++) {
            if (badges[i] == badgeId) return; // Already has badge
        }
        badges.push(badgeId);
        emit BadgeAwarded(tokenId, badgeId);
    }

    // ── Required override ──────────────────────────────────────────
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
