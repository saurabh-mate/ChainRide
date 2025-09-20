const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const RideSharing = await ethers.getContractFactory("RideSharing");
  console.log("Deploying RideSharing contract...");
  const rideSharing = await RideSharing.deploy();

  console.log("RideSharing deployed to:", rideSharing.target);

  const contractData = {
    address: rideSharing.target,
  };

  fs.writeFileSync("contract-address.json", JSON.stringify(contractData));

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
