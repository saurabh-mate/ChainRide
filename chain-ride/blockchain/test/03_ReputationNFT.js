const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

describe("ReputationNFT", function () {
  async function deployFixture() {
    const [admin, platform, escrow, user1, user2] = await ethers.getSigners();
    const nft = await ethers.deployContract("ReputationNFT", [admin.address]);
    // Grant ESCROW_ROLE to escrow signer for recordRide testing
    const ESCROW_ROLE = await nft.ESCROW_ROLE();
    await nft.connect(admin).grantRole(ESCROW_ROLE, escrow.address);
    const PLATFORM_ROLE = await nft.PLATFORM_ROLE();
    await nft.connect(admin).grantRole(PLATFORM_ROLE, platform.address);
    return { nft, admin, platform, escrow, user1, user2 };
  }

  describe("Deployment", function () {
    it("should grant admin all roles", async function () {
      const { nft, admin } = await loadFixture(deployFixture);
      expect(await nft.hasRole(await nft.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
      expect(await nft.hasRole(await nft.PLATFORM_ROLE(), admin.address)).to.be.true;
    });
  });

  describe("mint()", function () {
    it("should mint a reputation NFT", async function () {
      const { nft, platform, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      expect(await nft.ownerOf(tokenId)).to.equal(user1.address);
    });

    it("should record wallet → tokenId mapping", async function () {
      const { nft, platform, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      expect(await nft.walletToTokenId(user1.address)).to.equal(tokenId);
    });

    it("should initialize reputation struct correctly", async function () {
      const { nft, platform, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      const rep = await nft.reputations(tokenId);
      expect(rep.totalRides).to.equal(0n);
      expect(rep.totalRatingsCount).to.equal(0n);
      expect(rep.loyaltyTier).to.equal(0); // Bronze
      expect(rep.isDriver).to.be.false;
      expect(rep.isVerified).to.be.false;
    });

    it("should revert if wallet already has a token", async function () {
      const { nft, platform, user1 } = await loadFixture(deployFixture);
      await nft.connect(platform).mint(user1.address);
      await expect(
        nft.connect(platform).mint(user1.address)
      ).to.be.revertedWith("ReputationNFT: already minted");
    });

    it("should only let PLATFORM_ROLE mint", async function () {
      const { nft, user1, user2 } = await loadFixture(deployFixture);
      await expect(
        nft.connect(user1).mint(user2.address)
      ).to.be.revertedWithCustomError(nft, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Soulbound transfer prevention", function () {
    it("should prevent transfers after mint", async function () {
      const { nft, platform, user1, user2 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      await expect(
        nft.connect(user1).transferFrom(user1.address, user2.address, tokenId)
      ).to.be.revertedWith("ReputationNFT: soulbound, non-transferable");
    });

    it("should allow minting to address(0) if needed (approved operator)", async function () {
      const { nft, platform, user1, user2 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      // Even approve + transferFrom should fail
      await nft.connect(user1).approve(user2.address, tokenId);
      await expect(
        nft.connect(user2).transferFrom(user1.address, user2.address, tokenId)
      ).to.be.revertedWith("ReputationNFT: soulbound, non-transferable");
    });
  });

  describe("recordRide()", function () {
    it("should increment ride count and rating points", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      await nft.connect(escrow).recordRide(tokenId, 5, true);
      const rep = await nft.reputations(tokenId);
      expect(rep.totalRides).to.equal(1n);
      expect(rep.totalRatingPoints).to.equal(500n); // 5 * 100
      expect(rep.totalRatingsCount).to.equal(1n);
    });

    it("should set isDriver=true when asDriver=true", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      await nft.connect(escrow).recordRide(tokenId, 4, true);
      const rep = await nft.reputations(tokenId);
      expect(rep.isDriver).to.be.true;
    });

    it("should track consecutive 5-star streak", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      await nft.connect(escrow).recordRide(tokenId, 5, true);
      await nft.connect(escrow).recordRide(tokenId, 5, true);
      const rep = await nft.reputations(tokenId);
      expect(rep.consecutiveFiveStars).to.equal(2n);
    });

    it("should reset consecutive streak on non-5-star", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      await nft.connect(escrow).recordRide(tokenId, 5, true);
      await nft.connect(escrow).recordRide(tokenId, 5, true);
      await nft.connect(escrow).recordRide(tokenId, 4, true); // breaks streak
      const rep = await nft.reputations(tokenId);
      expect(rep.consecutiveFiveStars).to.equal(0n);
    });

    it("should only let ESCROW_ROLE record rides", async function () {
      const { nft, platform, user1, user2 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      await expect(
        nft.connect(user2).recordRide(tokenId, 5, true)
      ).to.be.revertedWithCustomError(nft, "AccessControlUnauthorizedAccount");
    });

    it("should reject invalid star values", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      await expect(
        nft.connect(escrow).recordRide(tokenId, 0, true)
      ).to.be.revertedWith("ReputationNFT: stars 1-5");
      await expect(
        nft.connect(escrow).recordRide(tokenId, 6, true)
      ).to.be.revertedWith("ReputationNFT: stars 1-5");
    });

    it("should reject invalid tokenId", async function () {
      const { nft, escrow } = await loadFixture(deployFixture);
      await expect(
        nft.connect(escrow).recordRide(999, 5, true)
      ).to.be.revertedWith("ReputationNFT: invalid token");
    });
  });

  describe("Loyalty tier progression", function () {
    it("should upgrade from Bronze to Silver at 10 rides", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      for (let i = 0; i < 10; i++) {
        await nft.connect(escrow).recordRide(tokenId, 5, true);
      }
      const rep = await nft.reputations(tokenId);
      expect(rep.loyaltyTier).to.equal(1); // Silver
    });

    it("should upgrade from Silver to Gold at 50 rides", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      for (let i = 0; i < 50; i++) {
        await nft.connect(escrow).recordRide(tokenId, 5, true);
      }
      const rep = await nft.reputations(tokenId);
      expect(rep.loyaltyTier).to.equal(2); // Gold
    });

    it("should upgrade to Platinum at 200 rides", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      for (let i = 0; i < 200; i++) {
        await nft.connect(escrow).recordRide(tokenId, 5, true);
      }
      const rep = await nft.reputations(tokenId);
      expect(rep.loyaltyTier).to.equal(3); // Platinum
    });

    it("should emit LoyaltyTierUpgraded event", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      for (let i = 0; i < 10; i++) {
        await nft.connect(escrow).recordRide(tokenId, 5, true);
      }
      await expect(
        nft.connect(escrow).recordRide(tokenId, 5, true)
      ).to.emit(nft, "LoyaltyTierUpgraded").withArgs(tokenId, 1);
    });
  });

  describe("Badge awards", function () {
    it("should award First Ride badge at ride #1", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      await nft.connect(escrow).recordRide(tokenId, 5, true);
      const badges = await nft.getBadges(tokenId);
      expect(badges).to.include(1n); // First Ride badge
    });

    it("should award 5-Star Streak badge at 5 consecutive 5-star rides", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      for (let i = 0; i < 5; i++) {
        await nft.connect(escrow).recordRide(tokenId, 5, true);
      }
      const badges = await nft.getBadges(tokenId);
      expect(badges).to.include(6n); // 5-Star Streak badge
    });

    it("should not award duplicate badges", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      await nft.connect(escrow).recordRide(tokenId, 5, true);
      await nft.connect(escrow).recordRide(tokenId, 5, true);
      const badges = await nft.getBadges(tokenId);
      // Badge 1 should appear only once
      let count = 0;
      for (const b of badges) {
        if (b === 1n) count++;
      }
      expect(count).to.equal(1);
    });

    it("PLATFORM_ROLE can manually award badges", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      await nft.connect(platform).awardBadge(tokenId, 7); // Early Adopter
      const badges = await nft.getBadges(tokenId);
      expect(badges).to.include(7n);
    });
  });

  describe("setDriverVerified()", function () {
    it("should mark driver as verified and award badge #10", async function () {
      const { nft, platform, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      await nft.connect(platform).setDriverVerified(tokenId);
      const rep = await nft.reputations(tokenId);
      expect(rep.isVerified).to.be.true;
      const badges = await nft.getBadges(tokenId);
      expect(badges).to.include(10n); // Verified Driver badge
    });
  });

  describe("updateMetadata()", function () {
    it("should let token owner update metadata IPFS hash", async function () {
      const { nft, platform, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      await nft.connect(user1).updateMetadata(tokenId, "QmNewHash123");
      const rep = await nft.reputations(tokenId);
      expect(rep.metadataIPFSHash).to.equal("QmNewHash123");
    });

    it("should not let non-owner update metadata", async function () {
      const { nft, platform, user1, user2 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      await expect(
        nft.connect(user2).updateMetadata(tokenId, "QmHack")
      ).to.be.revertedWith("ReputationNFT: not owner");
    });
  });

  describe("getAverageRating()", function () {
    it("should return 500 (5.00) for no ratings", async function () {
      const { nft, platform, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      expect(await nft.getAverageRating(tokenId)).to.equal(500n);
    });

    it("should return correct weighted average", async function () {
      const { nft, platform, escrow, user1 } = await loadFixture(deployFixture);
      const tx = await nft.connect(platform).mint(user1.address);
      const receipt = await tx.wait();
      const tokenId = receipt.logs[0].args[1];
      // 3 rides: 5-star, 4-star, 3-star
      await nft.connect(escrow).recordRide(tokenId, 5, false);
      await nft.connect(escrow).recordRide(tokenId, 4, false);
      await nft.connect(escrow).recordRide(tokenId, 3, false);
      // avg = (500 + 400 + 300) / 3 = 400 = 4.00
      expect(await nft.getAverageRating(tokenId)).to.equal(400n);
    });
  });
});
