const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

describe("FeeManager", function () {
  async function deployFixture() {
    const [admin, governor] = await ethers.getSigners();
    const feeManager = await ethers.deployContract("FeeManager", [admin.address]);
    return { feeManager, admin, governor };
  }

  describe("Deployment", function () {
    it("should set correct initial values", async function () {
      const { feeManager } = await loadFixture(deployFixture);
      expect(await feeManager.platformFeePercent()).to.equal(200n);
      expect(await feeManager.carpoolFeePercent()).to.equal(150n);
      expect(await feeManager.cancellationFee()).to.equal(2n * ethers.parseEther("1"));
      expect(await feeManager.maxSurgeMultiplier()).to.equal(500n);
      expect(await feeManager.baseFarePerKm()).to.equal(ethers.parseEther("0.5"));
      expect(await feeManager.baseFareFlat()).to.equal(ethers.parseEther("1"));
    });

    it("should set default loyalty discounts", async function () {
      const { feeManager } = await loadFixture(deployFixture);
      expect(await feeManager.loyaltyDiscounts(0)).to.equal(0);    // Bronze
      expect(await feeManager.loyaltyDiscounts(1)).to.equal(500);  // Silver 5%
      expect(await feeManager.loyaltyDiscounts(2)).to.equal(1000);  // Gold 10%
      expect(await feeManager.loyaltyDiscounts(3)).to.equal(1500); // Platinum 15%
    });

    it("should set default vehicle multipliers", async function () {
      const { feeManager } = await loadFixture(deployFixture);
      expect(await feeManager.vehicleMultipliers(0)).to.equal(100); // economy
      expect(await feeManager.vehicleMultipliers(1)).to.equal(130); // comfort
      expect(await feeManager.vehicleMultipliers(2)).to.equal(160); // xl
      expect(await feeManager.vehicleMultipliers(3)).to.equal(110); // electric
      expect(await feeManager.vehicleMultipliers(4)).to.equal(200); // luxury
    });

    it("should grant admin GOVERNOR_ROLE", async function () {
      const { feeManager, admin } = await loadFixture(deployFixture);
      const GOVERNOR = await feeManager.GOVERNOR_ROLE();
      expect(await feeManager.hasRole(GOVERNOR, admin.address)).to.be.true;
    });
  });

  describe("calculateFare()", function () {
    it("should calculate fare for economy, no surge, bronze tier", async function () {
      const { feeManager } = await loadFixture(deployFixture);
      // 5km ride, economy (1.0x), bronze (0%), surge 1.0x
      const [total, platformFee, driverPayout] = await feeManager.calculateFare(
        5000, 0, 0, 100
      );
      // baseFare = 1 + (5 * 0.5) = 3.5 RIDE
      // preSurge = 3.5 * 1.0 = 3.5
      // postSurge = 3.5 * 1.0 = 3.5
      // platformFee = 3.5 * 200 / 10000 = 0.07
      // driverPayout = 3.5 - 0.07 = 3.43
      expect(total).to.equal(ethers.parseEther("3.5"));
      expect(platformFee).to.equal(ethers.parseEther("0.07"));
      expect(driverPayout).to.equal(ethers.parseEther("3.43"));
    });

    it("should calculate fare for luxury vehicle", async function () {
      const { feeManager } = await loadFixture(deployFixture);
      // 10km ride, luxury (2.0x), no surge, bronze
      const [total, platformFee, driverPayout] = await feeManager.calculateFare(
        10000, 4, 0, 100
      );
      // baseFare = 1 + (10 * 0.5) = 6 RIDE
      // preSurge = 6 * 2.0 = 12
      // platformFee = 12 * 200 / 10000 = 0.24
      // driverPayout = 12 - 0.24 = 11.76
      expect(total).to.equal(ethers.parseEther("12"));
      expect(platformFee).to.equal(ethers.parseEther("0.24"));
      expect(driverPayout).to.equal(ethers.parseEther("11.76"));
    });

    it("should apply surge multiplier correctly", async function () {
      const { feeManager } = await loadFixture(deployFixture);
      // 10km, economy, 1.5x surge
      const [total, ,] = await feeManager.calculateFare(10000, 0, 0, 150);
      // baseFare = 1 + 5 = 6
      // preSurge = 6 * 1.0 = 6
      // postSurge = 6 * 1.5 = 9
      expect(total).to.equal(ethers.parseEther("9"));
    });

    it("should apply loyalty discount to platform fee only", async function () {
      const { feeManager } = await loadFixture(deployFixture);
      // 10km, economy, 1.5x surge, platinum tier
      const [, platformFeePlatinum, ] = await feeManager.calculateFare(10000, 0, 3, 100);
      const [, platformFeeBronze, ] = await feeManager.calculateFare(10000, 0, 0, 100);
      // Platinum gets 15% off platform fee, bronze gets 0%
      // Platform fee is charged on postSurgeFare = 6 RIDE
      // Platinum discount = 6 * 200 / 10000 * 0.15 = 0.018
      // Bronze platform fee = 0.12, Platinum = 0.102
      expect(platformFeePlatinum).to.be.lt(platformFeeBronze);
    });

    it("should cap surge at maxSurgeMultiplier", async function () {
      const { feeManager } = await loadFixture(deployFixture);
      await expect(
        feeManager.calculateFare(5000, 0, 0, 600)
      ).to.be.revertedWith("FeeManager: exceeds max surge");
    });

    it("should reject surge below 1.0x", async function () {
      const { feeManager } = await loadFixture(deployFixture);
      await expect(
        feeManager.calculateFare(5000, 0, 0, 50)
      ).to.be.revertedWith("FeeManager: surge minimum is 1.0x");
    });

    it("should handle zero distance", async function () {
      const { feeManager } = await loadFixture(deployFixture);
      const [total, platformFee, driverPayout] = await feeManager.calculateFare(0, 0, 0, 100);
      // baseFare = 1 + 0 = 1 RIDE (flat fee only)
      expect(total).to.equal(ethers.parseEther("1"));
      expect(driverPayout).to.equal(ethers.parseEther("0.98"));
    });
  });

  describe("calculateCarpoolFee()", function () {
    it("should split carpool fare correctly", async function () {
      const { feeManager } = await loadFixture(deployFixture);
      const pricePerSeat = ethers.parseEther("10");
      const [fee, driverReceives] = await feeManager.calculateCarpoolFee(pricePerSeat);
      // fee = 10 * 150 / 10000 = 0.15 RIDE
      // driver = 10 - 0.15 = 9.85 RIDE
      expect(fee).to.equal(ethers.parseEther("0.15"));
      expect(driverReceives).to.equal(ethers.parseEther("9.85"));
    });
  });

  describe("Fee update functions", function () {
    it("governor can update platformFee", async function () {
      const { feeManager, admin } = await loadFixture(deployFixture);
      await feeManager.connect(admin).setPlatformFee(300);
      expect(await feeManager.platformFeePercent()).to.equal(300n);
    });

    it("governor can update carpoolFee", async function () {
      const { feeManager, admin } = await loadFixture(deployFixture);
      await feeManager.connect(admin).setCarpoolFee(200);
      expect(await feeManager.carpoolFeePercent()).to.equal(200n);
    });

    it("governor can update cancellationFee", async function () {
      const { feeManager, admin } = await loadFixture(deployFixture);
      const newFee = ethers.parseEther("5");
      await feeManager.connect(admin).setCancellationFee(newFee);
      expect(await feeManager.cancellationFee()).to.equal(newFee);
    });

    it("governor can update maxSurge", async function () {
      const { feeManager, admin } = await loadFixture(deployFixture);
      await feeManager.connect(admin).setMaxSurge(300);
      expect(await feeManager.maxSurgeMultiplier()).to.equal(300n);
    });

    it("governor can update baseFarePerKm", async function () {
      const { feeManager, admin } = await loadFixture(deployFixture);
      const newFare = ethers.parseEther("1");
      await feeManager.connect(admin).setBaseFarePerKm(newFare);
      expect(await feeManager.baseFarePerKm()).to.equal(newFare);
    });

    it("governor can update loyalty discount", async function () {
      const { feeManager, admin } = await loadFixture(deployFixture);
      await feeManager.connect(admin).setLoyaltyDiscount(2, 1500);
      expect(await feeManager.loyaltyDiscounts(2)).to.equal(1500n);
    });

    it("rejects non-governor", async function () {
      const { feeManager, governor } = await loadFixture(deployFixture);
      await expect(
        feeManager.connect(governor).setPlatformFee(300)
      ).to.be.revertedWithCustomError(feeManager, "AccessControlUnauthorizedAccount");
    });

    it("platformFee max is 10%", async function () {
      const { feeManager, admin } = await loadFixture(deployFixture);
      await expect(
        feeManager.connect(admin).setPlatformFee(1001)
      ).to.be.revertedWith("FeeManager: max 10%");
    });

    it("maxSurge must be 1x-10x", async function () {
      const { feeManager, admin } = await loadFixture(deployFixture);
      await expect(
        feeManager.connect(admin).setMaxSurge(50)  // below 1x
      ).to.be.revertedWith("FeeManager: range 1x-10x");
    });

    it("loyaltyDiscount max 50%", async function () {
      const { feeManager, admin } = await loadFixture(deployFixture);
      await expect(
        feeManager.connect(admin).setLoyaltyDiscount(0, 5001)
      ).to.be.revertedWith("FeeManager: max 50% discount");
    });

    it("setVehicleMultiplier enforces range", async function () {
      const { feeManager, admin } = await loadFixture(deployFixture);
      await feeManager.connect(admin).setVehicleMultiplier(0, 50); // 0.5x min
      expect(await feeManager.vehicleMultipliers(0)).to.equal(50n);
      await expect(
        feeManager.connect(admin).setVehicleMultiplier(0, 501) // 5.01x max
      ).to.be.revertedWith("FeeManager: range 0.5x-5.0x");
    });

    it("emits FeeUpdated events", async function () {
      const { feeManager, admin } = await loadFixture(deployFixture);
      await expect(feeManager.connect(admin).setPlatformFee(300))
        .to.emit(feeManager, "FeeUpdated")
        .withArgs("platformFee", 200, 300);
    });
  });
});
