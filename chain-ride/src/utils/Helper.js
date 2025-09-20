import Web3 from 'web3';

const web3 = new Web3('http://127.0.0.1:8545');

const etherToWei = (amount) => {
  return web3.utils.toWei(amount.toString(), 'ether');
};

const weiToEther = (amount) => {
  return web3.utils.fromWei(amount.toString(), 'ether');
};

const Helper = {
  calculateDistance: (start, end) => {
    const R = 6371;
    const dLat = Helper.deg2rad(end.lat - start.lat);
    const dLon = Helper.deg2rad(end.lng - start.lng);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(Helper.deg2rad(start.lat)) * Math.cos(Helper.deg2rad(end.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
  },

  deg2rad: (deg) => {
    return deg * (Math.PI / 180);
  },

  calculateFare: (distance) => {
    return distance * 5; 
  }
};

export { etherToWei, weiToEther, Helper };
