/**
 * CarpoolSecure.js — Tests for the ETH-lock-safe Carpool contract
 *
 * Tests verify:
 * 1. Normal flow: book → complete → driver paid, platform fee collected
 * 2. Cancel flow: driver cancels → passengers can refund
 * 3. Timeout flow: driver never completes → passengers can refund after 72h
 * 4. Security: no double refunds, no self-booking, no early refunds
 */

const { expect }       = require('chai');
const { ethers }       = require('hardhat');
const { time }         = require('@nomicfoundation/hardhat-network-helpers');

const COMPLETION_TIMEOUT = 72 * 60 * 60; // 72 hours in seconds
const PLATFORM_FEE_BPS   = 500;           // 5%

describe('CarpoolSecure', function () {
  let contract;
  let owner, driver, passenger1, passenger2, other;

  const PRICE_PER_SEAT = ethers.parseEther('0.01');

  async function deployContract() {
    const CarpoolSecure = await ethers.getContractFactory('CarpoolSecure');
    contract = await CarpoolSecure.deploy();
    await contract.waitForDeployment();
  }

  async function createRide(overrides = {}) {
    const departureTime = (await time.latest()) + 3600; // 1 hour from now
    const tx = await contract.connect(driver).createRide(
      overrides.origin        ?? 'Mumbai',
      overrides.destination   ?? 'Pune',
      overrides.pricePerSeat  ?? PRICE_PER_SEAT,
      overrides.totalSeats    ?? 4,
      overrides.departureTime ?? departureTime
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(l => {
      try { return contract.interface.parseLog(l).name === 'RideCreated'; } catch { return false; }
    });
    const parsed = contract.interface.parseLog(event);
    return parsed.args[0]; // rideId
  }

  beforeEach(async function () {
    [owner, driver, passenger1, passenger2, other] = await ethers.getSigners();
    await deployContract();
  });

  // ── Deploy ─────────────────────────────────────────────────────────────────
  describe('Deployment', function () {
    it('sets owner correctly', async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it('starts with zero rides and zero platform balance', async function () {
      expect(await contract.rideCount()).to.equal(0n);
      expect(await contract.platformBalance()).to.equal(0n);
    });
  });

  // ── Create Ride ────────────────────────────────────────────────────────────
  describe('createRide', function () {
    it('creates a ride and emits RideCreated event', async function () {
      const departureTime = (await time.latest()) + 3600;
      await expect(
        contract.connect(driver).createRide('Mumbai', 'Pune', PRICE_PER_SEAT, 4, departureTime)
      ).to.emit(contract, 'RideCreated');
      expect(await contract.rideCount()).to.equal(1n);
    });

    it('rejects departure time in the past', async function () {
      const pastTime = (await time.latest()) - 60;
      await expect(
        contract.connect(driver).createRide('A', 'B', PRICE_PER_SEAT, 4, pastTime)
      ).to.be.revertedWith('Departure must be in future');
    });

    it('rejects zero price', async function () {
      const futureTime = (await time.latest()) + 3600;
      await expect(
        contract.connect(driver).createRide('A', 'B', 0n, 4, futureTime)
      ).to.be.revertedWith('Price must be > 0');
    });

    it('rejects too many seats', async function () {
      const futureTime = (await time.latest()) + 3600;
      await expect(
        contract.connect(driver).createRide('A', 'B', PRICE_PER_SEAT, 9, futureTime)
      ).to.be.revertedWith('Invalid seat count');
    });
  });

  // ── Book Seat ──────────────────────────────────────────────────────────────
  describe('bookSeat', function () {
    let rideId;
    beforeEach(async function () { rideId = await createRide(); });

    it('allows passengers to book and holds ETH in escrow', async function () {
      await expect(
        contract.connect(passenger1).bookSeat(rideId, { value: PRICE_PER_SEAT })
      ).to.emit(contract, 'SeatBooked').withArgs(rideId, passenger1.address, PRICE_PER_SEAT);

      const ride = await contract.getRide(rideId);
      expect(ride.seatsBooked).to.equal(1n);
      expect(ride.escrowBalance).to.equal(PRICE_PER_SEAT);
    });

    it('refunds excess payment immediately', async function () {
      const overpay = PRICE_PER_SEAT + ethers.parseEther('0.005');
      const balBefore = await ethers.provider.getBalance(passenger1.address);
      const tx = await contract.connect(passenger1).bookSeat(rideId, { value: overpay });
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * tx.gasPrice;
      const balAfter = await ethers.provider.getBalance(passenger1.address);
      // Should have paid exactly pricePerSeat + gas, not overpay
      expect(balBefore - balAfter - gasUsed).to.be.closeTo(PRICE_PER_SEAT, ethers.parseEther('0.0001'));
    });

    it('prevents double booking by same passenger', async function () {
      await contract.connect(passenger1).bookSeat(rideId, { value: PRICE_PER_SEAT });
      await expect(
        contract.connect(passenger1).bookSeat(rideId, { value: PRICE_PER_SEAT })
      ).to.be.revertedWith('Already booked');
    });

    it('prevents driver from booking their own ride', async function () {
      await expect(
        contract.connect(driver).bookSeat(rideId, { value: PRICE_PER_SEAT })
      ).to.be.revertedWith('Driver cannot book own ride');
    });

    it('rejects insufficient payment', async function () {
      await expect(
        contract.connect(passenger1).bookSeat(rideId, { value: PRICE_PER_SEAT - 1n })
      ).to.be.revertedWith('Insufficient payment');
    });
  });

  // ── Complete Ride ──────────────────────────────────────────────────────────
  describe('completeRide (normal flow)', function () {
    let rideId;
    beforeEach(async function () {
      rideId = await createRide();
      await contract.connect(passenger1).bookSeat(rideId, { value: PRICE_PER_SEAT });
      await contract.connect(passenger2).bookSeat(rideId, { value: PRICE_PER_SEAT });
    });

    it('pays driver (95%) and platform (5%) correctly', async function () {
      const driverBefore = await ethers.provider.getBalance(driver.address);
      const tx = await contract.connect(driver).completeRide(
        rideId, [passenger1.address, passenger2.address]
      );
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * tx.gasPrice;
      const driverAfter = await ethers.provider.getBalance(driver.address);

      const totalEscrow = PRICE_PER_SEAT * 2n;
      const expectedFee    = (totalEscrow * BigInt(PLATFORM_FEE_BPS)) / 10000n;
      const expectedPayout = totalEscrow - expectedFee;

      expect(driverAfter - driverBefore + gasUsed).to.be.closeTo(
        expectedPayout, ethers.parseEther('0.0001')
      );
      expect(await contract.platformBalance()).to.equal(expectedFee);
    });

    it('emits RideCompleted event', async function () {
      await expect(
        contract.connect(driver).completeRide(rideId, [passenger1.address, passenger2.address])
      ).to.emit(contract, 'RideCompleted');
    });

    it('prevents completing twice', async function () {
      await contract.connect(driver).completeRide(rideId, [passenger1.address]);
      await expect(
        contract.connect(driver).completeRide(rideId, [passenger2.address])
      ).to.be.revertedWith('Already completed');
    });

    it('prevents non-driver from completing', async function () {
      await expect(
        contract.connect(other).completeRide(rideId, [passenger1.address])
      ).to.be.revertedWith('Only driver can complete');
    });
  });

  // ── Cancellation & Refund ─────────────────────────────────────────────────
  describe('cancelRide + refundBooking (cancel flow)', function () {
    let rideId;
    beforeEach(async function () {
      rideId = await createRide();
      await contract.connect(passenger1).bookSeat(rideId, { value: PRICE_PER_SEAT });
    });

    it('driver can cancel, passenger gets full refund', async function () {
      await contract.connect(driver).cancelRide(rideId);

      const balBefore = await ethers.provider.getBalance(passenger1.address);
      const tx = await contract.connect(passenger1).refundBooking(rideId);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * tx.gasPrice;
      const balAfter = await ethers.provider.getBalance(passenger1.address);

      expect(balAfter - balBefore + gasUsed).to.equal(PRICE_PER_SEAT);
    });

    it('emits RefundIssued event', async function () {
      await contract.connect(driver).cancelRide(rideId);
      await expect(
        contract.connect(passenger1).refundBooking(rideId)
      ).to.emit(contract, 'RefundIssued').withArgs(rideId, passenger1.address, PRICE_PER_SEAT);
    });

    it('prevents double refund', async function () {
      await contract.connect(driver).cancelRide(rideId);
      await contract.connect(passenger1).refundBooking(rideId);
      await expect(
        contract.connect(passenger1).refundBooking(rideId)
      ).to.be.revertedWith('Already refunded');
    });

    it('prevents cancellation after completion', async function () {
      await contract.connect(driver).completeRide(rideId, [passenger1.address]);
      await expect(
        contract.connect(driver).cancelRide(rideId)
      ).to.be.revertedWith('Already completed');
    });
  });

  // ── SECURITY: ETH Lock Fix — Timeout Refund ──────────────────────────────
  describe('refundBooking (timeout flow — ETH lock fix)', function () {
    let rideId;
    beforeEach(async function () {
      rideId = await createRide();
      await contract.connect(passenger1).bookSeat(rideId, { value: PRICE_PER_SEAT });
    });

    it('blocks refund before timeout if ride not cancelled', async function () {
      // Only advance time to just after departure (not past timeout)
      const ride = await contract.getRide(rideId);
      await time.increaseTo(Number(ride.departureTime) + 3600); // 1h after departure

      await expect(
        contract.connect(passenger1).refundBooking(rideId)
      ).to.be.revertedWith('Refund not available yet');
    });

    it('allows refund after COMPLETION_TIMEOUT if driver never completes ← ETH lock fix', async function () {
      const ride = await contract.getRide(rideId);
      // Advance past 72h completion timeout
      await time.increaseTo(Number(ride.departureTime) + COMPLETION_TIMEOUT + 1);

      const balBefore = await ethers.provider.getBalance(passenger1.address);
      const tx = await contract.connect(passenger1).refundBooking(rideId);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * tx.gasPrice;
      const balAfter = await ethers.provider.getBalance(passenger1.address);

      expect(balAfter - balBefore + gasUsed).to.equal(PRICE_PER_SEAT);
    });

    it('isRefundEligible returns correct state before and after timeout', async function () {
      const ride = await contract.getRide(rideId);

      const [eligibleBefore] = await contract.isRefundEligible(rideId, passenger1.address);
      expect(eligibleBefore).to.be.false;

      await time.increaseTo(Number(ride.departureTime) + COMPLETION_TIMEOUT + 1);

      const [eligibleAfter, reason] = await contract.isRefundEligible(rideId, passenger1.address);
      expect(eligibleAfter).to.be.true;
      expect(reason).to.equal('Ride completion timed out');
    });
  });

  // ── Platform Fee Withdrawal ───────────────────────────────────────────────
  describe('withdrawPlatformFees', function () {
    it('allows owner to withdraw accumulated fees', async function () {
      const rideId = await createRide();
      await contract.connect(passenger1).bookSeat(rideId, { value: PRICE_PER_SEAT });
      await contract.connect(driver).completeRide(rideId, [passenger1.address]);

      const fees = await contract.platformBalance();
      expect(fees).to.be.gt(0n);

      const ownerBefore = await ethers.provider.getBalance(owner.address);
      const tx = await contract.connect(owner).withdrawPlatformFees();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * tx.gasPrice;
      const ownerAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerAfter - ownerBefore + gasUsed).to.equal(fees);
      expect(await contract.platformBalance()).to.equal(0n);
    });

    it('rejects withdrawal by non-owner', async function () {
      await expect(
        contract.connect(other).withdrawPlatformFees()
      ).to.be.revertedWith('Only owner');
    });
  });
});
