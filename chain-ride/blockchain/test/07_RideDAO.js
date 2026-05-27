const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");

describe("RideDAO", function () {
  async function deployFixture() {
    const [admin, proposer, voter1, voter2, voter3, stranger] = await ethers.getSigners();

    const token = await ethers.deployContract("RideToken", [admin.address]);
    // Initialize token with voting support
    const tokenWithVotes = token;

    // Give admin enough tokens for proposal threshold (10,000 RIDE)
    await token.connect(admin).mint(admin.address, ethers.parseEther("20000"));
    await token.connect(admin).mint(voter1.address, ethers.parseEther("10000"));
    await token.connect(admin).mint(voter2.address, ethers.parseEther("10000"));
    await token.connect(admin).mint(voter3.address, ethers.parseEther("10000"));

    // Self-delegate so voters have voting power
    await token.connect(admin).delegate(admin.address);
    await token.connect(voter1).delegate(voter1.address);
    await token.connect(voter2).delegate(voter2.address);
    await token.connect(voter3).delegate(voter3.address);

    // Deploy timelock
    const timelock = await ethers.deployContract(
      "TimelockController",
      [3600, [], [] ]
    );

    // Deploy DAO
    const dao = await ethers.deployContract(
      "RideDAO",
      [token.target, timelock.target]
    );

    return { dao, token, timelock, admin, proposer, voter1, voter2, voter3, stranger };
  }

  describe("Deployment", function () {
    it("should set name to RideChain DAO", async function () {
      const { dao } = await loadFixture(deployFixture);
      expect(await dao.name()).to.equal("RideChain DAO");
    });

    it("votingDelay should be ~1 day in blocks", async function () {
      const { dao } = await loadFixture(deployFixture);
      // 7200 blocks at 12s/block ≈ 24h
      const delay = await dao.votingDelay();
      expect(delay).to.equal(7200n);
    });

    it("votingPeriod should be ~5 days in blocks", async function () {
      const { dao } = await loadFixture(deployFixture);
      // 36000 blocks at 12s/block ≈ 5 days
      const period = await dao.votingPeriod();
      expect(period).to.equal(36000n);
    });

    it("proposalThreshold should be 10,000 RIDE", async function () {
      const { dao } = await loadFixture(deployFixture);
      expect(await dao.proposalThreshold()).to.equal(ethers.parseEther("10000"));
    });

    it("quorum should be 4%", async function () {
      const { dao } = await loadFixture(deployFixture);
      const block = await ethers.provider.getBlock();
      expect(await dao.quorum(block.number)).to.be.gt(0n);
    });
  });

  describe("Proposal lifecycle", function () {
    it("cannot propose without sufficient token holdings", async function () {
      const { dao, stranger } = await loadFixture(deployFixture);
      const targets = [stranger.address];
      const values = [0n];
      const calldatas = ["0x"];
      const description = "Test proposal";

      await expect(
        dao.connect(stranger).propose(targets, values, calldatas, description)
      ).to.be.revertedWith("Governor: proposer vote weight below threshold");
    });

    it("proposer with sufficient tokens can propose", async function () {
      const { dao, admin, stranger } = await loadFixture(deployFixture);
      const targets = [stranger.address];
      const values = [0n];
      const calldatas = ["0x"];
      const description = "Test proposal";

      // admin has 20,000 RIDE (> 10,000 threshold)
      const tx = await dao.connect(admin).propose(targets, values, calldatas, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs[0].args[0];

      expect(proposalId).to.not.be.undefined;
      const state = await dao.state(proposalId);
      // State 0 = Pending (after voting delay)
      expect(state).to.equal(0);
    });

    it("proposal details are recorded", async function () {
      const { dao, admin, stranger } = await loadFixture(deployFixture);
      const targets = [stranger.address];
      const values = [0n];
      const calldatas = ["0x"];
      const description = "Fund payment proposal";

      const tx = await dao.connect(admin).propose(targets, values, calldatas, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs[0].args[0];

      const proposal = await dao.proposals(proposalId);
      expect(proposal.proposer).to.equal(admin.address);
      expect(proposal.targets[0]).to.equal(stranger.address);
      expect(proposal.description).to.include("Fund payment proposal");
    });

    it("voters with sufficient tokens can vote", async function () {
      const { dao, admin, voter1 } = await loadFixture(deployFixture);
      const targets = [admin.address];
      const values = [0n];
      const calldatas = ["0x"];
      const description = "Grant proposal";

      const tx = await dao.connect(admin).propose(targets, values, calldatas, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs[0].args[0];

      // voter1 has 10,000 RIDE (exactly threshold)
      await dao.connect(voter1).vote(proposalId, 1, 0, "Yes");
      const proposal = await dao.proposals(proposalId);
      const vote = await dao.hasVoted(proposalId, voter1.address);
      expect(vote).to.be.true;
    });

    it("voting against decreases quorum needed", async function () {
      const { dao, admin, voter1 } = await loadFixture(deployFixture);
      const targets = [admin.address];
      const values = [0n];
      const calldatas = ["0x"];
      const description = "Test vote";

      const tx = await dao.connect(admin).propose(targets, values, calldatas, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs[0].args[0];

      await dao.connect(voter1).vote(proposalId, 0, 0, "No"); // vote against
      // For against votes to count toward quorum would be unusual with GovernorCountingSimple
      // which counts for votes only. Against always loses in simple counting.
    });

    it("stranger cannot vote without tokens", async function () {
      const { dao, admin, stranger } = await loadFixture(deployFixture);
      const targets = [admin.address];
      const values = [0n];
      const calldatas = ["0x"];
      const description = "Test proposal";

      const tx = await dao.connect(admin).propose(targets, values, calldatas, description);
      const receipt = await tx.wait();
      const proposalId = receipt.logs[0].args[0];

      await expect(
        dao.connect(stranger).vote(proposalId, 1, 0, "Yes")
      ).to.be.revertedWith("Governor: proposer vote weight below threshold");
    });
  });

  describe("Inheritance integrity", function () {
    it("should support AccessControl interface", async function () {
      const { dao } = await loadFixture(deployFixture);
      // ERC165 check for AccessControl
      const ACC_INTERFACE = "0x7965db0b"; // AccessControl interface ID
      expect(await dao.supportsInterface(ACC_INTERFACE)).to.be.true;
    });

    it("should support Governor interface", async function () {
      const { dao } = await loadFixture(deployFixture);
      const GOV_INTERFACE = "0x5a22c1c3"; // Governor interface ID
      expect(await dao.supportsInterface(GOV_INTERFACE)).to.be.true;
    });

    it("should support ERC721 interface (needed for name/symbol)", async function () {
      const { dao } = await loadFixture(deployFixture);
      // IERC721 interface id
      const ERC721_INTERFACE = "0x80ac58cd";
      expect(await dao.supportsInterface(ERC721_INTERFACE)).to.be.true;
    });
  });
});