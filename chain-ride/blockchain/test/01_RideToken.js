const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

describe("RideToken", function () {
  const ADMIN = "0x0000000000000000000000000000000000000001";

  async function deployFixture() {
    const [admin, user1, user2, user3] = await ethers.getSigners();
    const token = await ethers.deployContract("RideToken", [admin.address]);
    return { token, admin, user1, user2, user3 };
  }

  describe("Deployment", function () {
    it("should set the token name and symbol", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.name()).to.equal("RideChain Token");
      expect(await token.symbol()).to.equal("RIDE");
    });

    it("should have 18 decimals", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.decimals()).to.equal(18);
    });

    it("should start with zero total supply", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.totalSupply()).to.equal(0n);
    });

    it("should grant admin all three roles", async function () {
      const { token, admin } = await loadFixture(deployFixture);
      const MINTER = await token.MINTER_ROLE();
      const PAUSER = await token.PAUSER_ROLE();
      const AIRDROP = await token.AIRDROP_ROLE();
      expect(await token.hasRole(MINTER, admin.address)).to.be.true;
      expect(await token.hasRole(PAUSER, admin.address)).to.be.true;
      expect(await token.hasRole(AIRDROP, admin.address)).to.be.true;
    });
  });

  describe("mint()", function () {
    it("should let MINTER_ROLE mint tokens", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1000");
      await token.connect(admin).mint(user1.address, amount);
      expect(await token.balanceOf(user1.address)).to.equal(amount);
      expect(await token.totalSupply()).to.equal(amount);
    });

    it("should revert if non-minter calls mint", async function () {
      const { token, user1 } = await loadFixture(deployFixture);
      await expect(
        token.connect(user1).mint(user1.address, 1000n)
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("should revert if minting exceeds MAX_SUPPLY", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      const MAX = await token.MAX_SUPPLY();
      await token.connect(admin).mint(user1.address, MAX);
      await expect(
        token.connect(admin).mint(user1.address, 1n)
      ).to.be.revertedWith("RideToken: exceeds max supply");
    });

    it("should emit Transfer event on mint", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("500");
      await expect(token.connect(admin).mint(user1.address, amount))
        .to.emit(token, "Transfer")
        .withArgs(ethers.ZeroAddress, user1.address, amount);
    });
  });

  describe("airdropBatch()", function () {
    it("should airdrop to multiple recipients", async function () {
      const { token, admin, user1, user2, user3 } = await loadFixture(deployFixture);
      const recipients = [user1.address, user2.address, user3.address];
      const amounts = [
        ethers.parseEther("10"),
        ethers.parseEther("20"),
        ethers.parseEther("30"),
      ];
      await token.connect(admin).airdropBatch(recipients, amounts);
      expect(await token.balanceOf(user1.address)).to.equal(amounts[0]);
      expect(await token.balanceOf(user2.address)).to.equal(amounts[1]);
      expect(await token.balanceOf(user3.address)).to.equal(amounts[2]);
    });

    it("should revert if arrays have mismatched lengths", async function () {
      const { token, admin, user1, user2 } = await loadFixture(deployFixture);
      await expect(
        token.connect(admin).airdropBatch([user1.address], [10n, 20n])
      ).to.be.revertedWith("RideToken: length mismatch");
    });

    it("should revert if batch exceeds 200 addresses", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      const largeArray = new Array(201).fill(user1.address);
      const largeAmounts = new Array(201).fill(1n);
      await expect(
        token.connect(admin).airdropBatch(largeArray, largeAmounts)
      ).to.be.revertedWith("RideToken: batch too large");
    });

    it("should revert if non-airdropper calls", async function () {
      const { token, user1 } = await loadFixture(deployFixture);
      await expect(
        token.connect(user1).airdropBatch([user1.address], [10n])
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("pause() / unpause()", function () {
    it("should let PAUSER_ROLE pause", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      await token.connect(admin).mint(user1.address, 1000n);
      await token.connect(admin).pause();
      await expect(
        token.connect(user1).transfer(admin.address, 100n)
      ).to.be.revertedWithCustomError(token, "ERC20Pausable: token transfer while paused");
    });

    it("should let PAUSER_ROLE unpause", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      await token.connect(admin).mint(user1.address, 1000n);
      await token.connect(admin).pause();
      await token.connect(admin).unpause();
      await expect(token.connect(user1).transfer(admin.address, 100n)).to.not.be.reverted;
    });

    it("non-pauser cannot pause", async function () {
      const { token, user1 } = await loadFixture(deployFixture);
      await expect(token.connect(user1).pause())
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("burn()", function () {
    it("should let any holder burn their tokens", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      await token.connect(admin).mint(user1.address, 1000n);
      await token.connect(user1).burn(300n);
      expect(await token.balanceOf(user1.address)).to.equal(700n);
      expect(await token.totalSupply()).to.equal(700n);
    });

    it("should emit Transfer event on burn", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      await token.connect(admin).mint(user1.address, 1000n);
      await expect(token.connect(user1).burn(300n))
        .to.emit(token, "Transfer")
        .withArgs(user1.address, ethers.ZeroAddress, 300n);
    });
  });

  describe("permissions edge cases", function () {
    it("admin can grant MINTER_ROLE to another address", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      const MINTER = await token.MINTER_ROLE();
      await token.connect(admin).grantRole(MINTER, user1.address);
      expect(await token.hasRole(MINTER, user1.address)).to.be.true;
    });

    it("admin can revoke roles", async function () {
      const { token, admin, user1 } = await loadFixture(deployFixture);
      const MINTER = await token.MINTER_ROLE();
      await token.connect(admin).revokeRole(MINTER, admin.address);
      expect(await token.hasRole(MINTER, admin.address)).to.be.false;
    });
  });
});
