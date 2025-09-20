# Chain Ride

Chain Ride is a decentralized application (DApp) for ride-sharing built on the Ethereum blockchain. It allows users to request rides, drivers to accept ride requests, and facilitates the transfer of funds between users and drivers.

## Requirements

- Node.js
- MongoDB
- Ganache CLI

## Installation

1. **Ganache CLI**
   - Install Ganache CLI globally:
     ```
     npm install -g ganache-cli
     ```
   - Start Ganache CLI:
     ```
     ganache-cli
     ```

2. **Chain Ride Backend**
   - Navigate to the `backend` directory:
     ```
     cd backend
    
     ```
   - Start the backend server:
     ```
     node server.js
     ```

3. **Hardhat Project**
   - Navigate to the `src` directory:
     ```
     cd src
     ```
   - Create a Hardhat project:
     ```
     npx hardhat init
     ```
   - Copy the `RideSharing.sol` file from the `contracts` folder to the Hardhat project's `contracts` folder.
   - Compile the contracts:
     ```
     npx hardhat compile
     ```

4. **Start MongoDB**
   - Start MongoDB and connect to localhost.
   - Create a database called `ridesharingapp`.

## Usage

1. **Chain Ride Backend**
   - Once the server is running, the backend API endpoints will be accessible for the Chain Ride frontend.

2. **Ganache Dashboard**
   - Visit `http://localhost:3002` in your browser to access the Ganache dashboard.
   - Use the dashboard to view accounts, transactions, and blocks on the local blockchain.