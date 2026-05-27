const hre = require("hardhat");

async function main() {
  console.log("Deploying Carpool contract...");

  const Carpool = await hre.ethers.getContractFactory("Carpool");
  const carpool = await Carpool.deploy();
  await carpool.waitForDeployment();

  const carpoolAddress = await carpool.getAddress();
  console.log(`Carpool deployed to: ${carpoolAddress}`);

  console.log("\nDeployment complete!");
  console.log(`Contract address: ${carpoolAddress}`);
  console.log(`Network: ${hre.network.name}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });