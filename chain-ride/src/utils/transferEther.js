import Web3 from 'web3';
import { etherToWei, weiToEther } from './Helper';

// Import the JSON artifact of the deployed contract
import RideSharingArtifact from '../hardhat-project/artifacts/contracts/RideSharing.sol/RideSharing.json';

console.log('RideSharingArtifact:', RideSharingArtifact);


// Initialize Web3
const web3 = new Web3('http://127.0.0.1:8545');

const transferEther = async (fromAddress, toAddress, fareAmount) => {
  
  try {
    // Get the network ID
    const networkId = await web3.eth.net.getId();
    console.log('Network ID:', networkId);
    
    // Convert the networkId to string
    const networkIdString = networkId.toString();
    console.log('Network ID (string):', networkIdString);


    // Get the contract instance using the RideSharing artifact and network ID
    const rideSharingContract = new web3.eth.Contract(
      RideSharingArtifact.abi,
      RideSharingArtifact.networks[networkIdString]?.address // Use optional chaining to access the address property
    );

    console.log('Contract address:', RideSharingArtifact.networks[networkIdString]?.address);


    console.log('Contract object:', rideSharingContract);

    
    // Check if contract object is defined
    if (!rideSharingContract || !rideSharingContract.options.address) {
      throw new Error('Contract object is not initialized or contract address is undefined');
    }

    // Convert the fare amount to Wei
    const farePrice = etherToWei(parseInt(fareAmount));

    // Call the startRide function on the contract
    await rideSharingContract.methods.startRide(toAddress, farePrice).send({ from: fromAddress, gasPrice: '1000000000' });

    // Transfer Ether from one address to another
    await web3.eth.sendTransaction({
      from: fromAddress,
      to: toAddress,
      value: farePrice,
      gas: '1000000', // Example gas limit
      gasPrice: '1000000000' // Example gas price in wei
    });

    // Get the new balances after the transaction
    const userBalanceAfter = await web3.eth.getBalance(fromAddress);
    const driverBalanceAfter = await web3.eth.getBalance(toAddress);

    // Log the balance changes
    console.log('User Balance After:', weiToEther(userBalanceAfter));
    console.log('Driver Balance After:', weiToEther(driverBalanceAfter));
  } catch (error) {
    console.error('Error transferring Ether:', error);
  }
};

export default transferEther;
