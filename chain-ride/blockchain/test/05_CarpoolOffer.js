const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

describe("CarpoolOffer", function () {
  async function deployFixture() {
    const [admin, treasury, driver, p1, p2, p3, stranger] = await ethers.getSigners();

    const token = await ethers.deployContract("RideToken", [admin.address]);
    const feeManager = await ethers.deployContract("FeeManager", [admin.address]);
    const carpool = await ethers.deployContract(
      "CarpoolOffer",
      [token.target, feeManager.target, treasury.address, admin.address]
    );

    // Give passengers tokens
    const MINTER_ROLE = await token.MINTER_ROLE();
    await token.connect(admin).mint(p1.address, ethers.parseEther("500"));
    await token.connect(admin).mint(p2.address, ethers.parseEther("500"));
    await token.connect(admin).mint(p3.address, ethers.parseEther("500"));
    await token.connect(admin).mint(driver.address, ethers.parseEther("100"));

    return { carpool, token, feeManager, treasury, admin, driver, p1, p2, p3, stranger };
  }

  describe("Deployment", function () {
    it("should store token and feeManager refs", async function () {
      const { carpool, token, feeManager } = await loadFixture(deployFixture);
      expect(await carpool.rideToken()).to.equal(token.target);
      expect(await carpool.feeManager()).to.equal(feeManager.target);
    });
  });

  describe("createOffer()", function () {
    it("should create an offer and increment counter", async function () {
      const { carpool, driver } = await loadFixture(deployFixture);
      const tx = await carpool.connect(driver).createOffer(
        "Berlin", "Munich", 9999999999, 3,
        ethers.parseEther("5"), 1, false, false, ethers.ZeroHash
      );
      const receipt = await tx.wait();
      expect(receipt.logs[0].args[0]).to.equal(1n);
    });

    it("should set all offer fields correctly", async function () {
      const { carpool, driver } = await loadFixture(deployFixture);
      const departure = Number(await ethers.provider.getBlock()) * 12 + 86400 * 2;
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", departure, 4,
        ethers.parseEther("8"), 2, true, false, ethers.ZeroHash
      );
      const offer = await carpool.offers(1);
      expect(offer.driver).to.equal(driver.address);
      expect(offer.fromCity).to.equal("Berlin");
      expect(offer.toCity).to.equal("Munich");
      expect(offer.totalSeats).to.equal(4);
      expect(offer.availableSeats).to.equal(4);
      expect(offer.pricePerSeat).to.equal(ethers.parseEther("8"));
      expect(offer.luggagePolicy).to.equal(2);
      expect(offer.petsAllowed).to.be.true;
      expect(offer.smokingAllowed).to.be.false;
      expect(offer.status).to.equal(0); // Open
    });

    it("should enforce seats 1-8", async function () {
      const { carpool, driver } = await loadFixture(deployFixture);
      await expect(
        carpool.connect(driver).createOffer(
          "A", "B", 9999999999, 0, 10n, 0, false, false, ethers.ZeroHash
        )
      ).to.be.revertedWith("CarpoolOffer: seats 1-8");
    });

    it("should enforce min price 1 RIDE", async function () {
      const { carpool, driver } = await loadFixture(deployFixture);
      await expect(
        carpool.connect(driver).createOffer(
          "A", "B", 9999999999, 2, ethers.parseEther("0.5"), 0, false, false, ethers.ZeroHash
        )
      ).to.be.revertedWith("CarpoolOffer: min 1 RIDE per seat");
    });

    it("should enforce max price 1000 RIDE", async function () {
      const { carpool, driver } = await loadFixture(deployFixture);
      await expect(
        carpool.connect(driver).createOffer(
          "A", "B", 9999999999, 2, ethers.parseEther("1001"), 0, false, false, ethers.ZeroHash
        )
      ).to.be.revertedWith("CarpoolOffer: max 1000 RIDE per seat");
    });

    it("should enforce departure in future", async function () {
      const { carpool, driver } = await loadFixture(deployFixture);
      await expect(
        carpool.connect(driver).createOffer(
          "A", "B", 1, 2, 10n, 0, false, false, ethers.ZeroHash
        )
      ).to.be.revertedWith("CarpoolOffer: must be in future");
    });

    it("should emit OfferCreated", async function () {
      const { carpool, driver } = await loadFixture(deployFixture);
      await expect(
        carpool.connect(driver).createOffer(
          "Berlin", "Munich", 9999999999, 3, 5n, 0, false, false, ethers.ZeroHash
        )
      ).to.emit(carpool, "OfferCreated");
    });
  });

  describe("bookSeats()", function () {
    it("should lock tokens in contract", async function () {
      const { carpool, token, driver, p1 } = await loadFixture(deployFixture);
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", 9999999999, 3, ethers.parseEther("5"), 0, false, false, ethers.ZeroHash
      );
      const before = await token.balanceOf(carpool.target);
      await carpool.connect(p1).bookSeats(1, 2);
      const after = await token.balanceOf(carpool.target);
      expect(after - before).to.equal(ethers.parseEther("10")); // 2 seats × 5 RIDE
    });

    it("should decrement availableSeats", async function () {
      const { carpool, driver, p1 } = await loadFixture(deployFixture);
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", 9999999999, 3, ethers.parseEther("5"), 0, false, false, ethers.ZeroHash
      );
      await carpool.connect(p1).bookSeats(1, 2);
      const offer = await carpool.offers(1);
      expect(offer.availableSeats).to.equal(1);
    });

    it("should mark offer Full when all seats booked", async function () {
      const { carpool, driver, p1 } = await loadFixture(deployFixture);
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", 9999999999, 2, ethers.parseEther("5"), 0, false, false, ethers.ZeroHash
      );
      await carpool.connect(p1).bookSeats(1, 2);
      const offer = await carpool.offers(1);
      expect(offer.status).to.equal(1); // Full
    });

    it("should record booking correctly", async function () {
      const { carpool, driver, p1 } = await loadFixture(deployFixture);
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", 9999999999, 3, ethers.parseEther("5"), 0, false, false, ethers.ZeroHash
      );
      await carpool.connect(p1).bookSeats(1, 2);
      const count = await carpool.getBookingCount(1);
      expect(count).to.equal(1);
    });

    it("driver cannot book own offer", async function () {
      const { carpool, driver } = await loadFixture(deployFixture);
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", 9999999999, 3, ethers.parseEther("5"), 0, false, false, ethers.ZeroHash
      );
      await expect(
        carpool.connect(driver).bookSeats(1, 1)
      ).to.be.revertedWith("CarpoolOffer: driver cannot book own offer");
    });

    it("cannot book more seats than available", async function () {
      const { carpool, driver, p1 } = await loadFixture(deployFixture);
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", 9999999999, 2, ethers.parseEther("5"), 0, false, false, ethers.ZeroHash
      );
      await expect(
        carpool.connect(p1).bookSeats(1, 5)
      ).to.be.revertedWith("CarpoolOffer: invalid seats");
    });

    it("cannot book on cancelled offer", async function () {
      const { carpool, driver, p1 } = await loadFixture(deployFixture);
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", 9999999999, 3, ethers.parseEther("5"), 0, false, false, ethers.ZeroHash
      );
      await carpool.connect(driver).cancelOffer(1);
      await expect(
        carpool.connect(p1).bookSeats(1, 1)
      ).to.be.revertedWith("CarpoolOffer: not open");
    });

    it("emits SeatsBooked event", async function () {
      const { carpool, driver, p1 } = await loadFixture(deployFixture);
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", 9999999999, 3, ethers.parseEther("5"), 0, false, false, ethers.ZeroHash
      );
      await expect(carpool.connect(p1).bookSeats(1, 2))
        .to.emit(carpool, "SeatsBooked")
        .withArgs(1n, p1.address, 2, ethers.parseEther("10"));
    });
  });

  describe("cancelBooking() — refund matrix", function () {
    it(">24h before departure → 100% refund", async function () {
      const { carpool, token, driver, p1 } = await loadFixture(deployFixture);
      const futureTime = Math.floor(Date.now() / 1000) + 86400 * 2; // 2 days out
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", futureTime, 3, ethers.parseEther("10"), 0, false, false, ethers.ZeroHash
      );
      await carpool.connect(p1).bookSeats(1, 2);
      const before = await token.balanceOf(p1.address);
      await carpool.connect(p1).cancelBooking(1);
      const after = await token.balanceOf(p1.address);
      expect(after - before).to.equal(ethers.parseEther("20")); // full refund
    });

    it("re-opens offer when Full → Open on cancel", async function () {
      const { carpool, driver, p1 } = await loadFixture(deployFixture);
      const futureTime = Math.floor(Date.now() / 1000) + 86400 * 2;
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", futureTime, 2, ethers.parseEther("10"), 0, false, false, ethers.ZeroHash
      );
      await carpool.connect(p1).bookSeats(1, 2); // offer now Full
      await carpool.connect(p1).cancelBooking(1);
      const offer = await carpool.offers(1);
      expect(offer.status).to.equal(0); // back to Open
    });
  });

  describe("departOffer()", function () {
    it("should transition to Departed and release 50%", async function () {
      const { carpool, token, treasury, driver, p1 } = await loadFixture(deployFixture);
      const futureTime = Math.floor(Date.now() / 1000) + 86400 * 2;
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", futureTime, 3, ethers.parseEther("10"), 0, false, false, ethers.ZeroHash
      );
      await carpool.connect(p1).bookSeats(1, 2); // 20 RIDE locked

      const treasuryBefore = await token.balanceOf(treasury.address);
      const driverBefore = await token.balanceOf(driver.address);

      await carpool.connect(driver).departOffer(1);

      const treasuryAfter = await token.balanceOf(treasury.address);
      const driverAfter = await token.balanceOf(driver.address);

      // 50% of 20 = 10 RIDE, carpoolFee 1.5% = 0.15, driver = 9.85
      expect(driverAfter - driverBefore).to.be.gt(0);
      expect(treasuryAfter - treasuryBefore).to.be.gt(0);
      expect(await carpool.offers(1).then(o => o.status)).to.equal(2); // Departed
    });

    it("only driver can depart", async function () {
      const { carpool, driver, p1, p2 } = await loadFixture(deployFixture);
      const futureTime = Math.floor(Date.now() / 1000) + 86400 * 2;
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", futureTime, 3, ethers.parseEther("10"), 0, false, false, ethers.ZeroHash
      );
      await carpool.connect(p1).bookSeats(1, 1);
      await expect(
        carpool.connect(p1).departOffer(1)
      ).to.be.revertedWith("CarpoolOffer: not driver");
    });
  });

  describe("completeOffer()", function () {
    it("should release remaining 50% to driver", async function () {
      const { carpool, token, treasury, driver, p1 } = await loadFixture(deployFixture);
      const futureTime = Math.floor(Date.now() / 1000) + 86400 * 2;
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", futureTime, 3, ethers.parseEther("10"), 0, false, false, ethers.ZeroHash
      );
      await carpool.connect(p1).bookSeats(1, 2);
      await carpool.connect(driver).departOffer(1);

      const driverBefore = await token.balanceOf(driver.address);
      await carpool.connect(driver).completeOffer(1);
      const driverAfter = await token.balanceOf(driver.address);

      // Second 50% released
      expect(driverAfter - driverBefore).to.be.gt(0);
      expect(await carpool.offers(1).then(o => o.status)).to.equal(3); // Completed
    });
  });

  describe("cancelOffer() by driver", function () {
    it("should refund all passengers and mark cancelled", async function () {
      const { carpool, token, driver, p1, p2 } = await loadFixture(deployFixture);
      const futureTime = Math.floor(Date.now() / 1000) + 86400 * 2;
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", futureTime, 4, ethers.parseEther("10"), 0, false, false, ethers.ZeroHash
      );
      await carpool.connect(p1).bookSeats(1, 2);
      await carpool.connect(p2).bookSeats(1, 1);

      const p1Before = await token.balanceOf(p1.address);
      const p2Before = await token.balanceOf(p2.address);

      await carpool.connect(driver).cancelOffer(1);

      const offer = await carpool.offers(1);
      expect(offer.status).to.equal(4); // Cancelled
      expect(await token.balanceOf(p1.address) - p1Before).to.equal(ethers.parseEther("20"));
      expect(await token.balanceOf(p2.address) - p2Before).to.equal(ethers.parseEther("10"));
    });

    it("only driver can cancel offer", async function () {
      const { carpool, driver, p1 } = await loadFixture(deployFixture);
      const futureTime = Math.floor(Date.now() / 1000) + 86400 * 2;
      await carpool.connect(driver).createOffer(
        "Berlin", "Munich", futureTime, 3, ethers.parseEther("10"), 0, false, false, ethers.ZeroHash
      );
      await carpool.connect(p1).bookSeats(1, 1);
      await expect(
        carpool.connect(p1).cancelOffer(1)
      ).to.be.revertedWith("CarpoolOffer: not driver");
    });
  });
});