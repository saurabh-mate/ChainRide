import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faWallet, faUser, faMapMarkerAlt } from '@fortawesome/free-solid-svg-icons';
import RideHistory from './RideHistory'; 
import Web3 from 'web3';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Initialize Web3
const web3 = new Web3('http://127.0.0.1:8545');

const Profile = ({ loggedInUser }) => {
  const [user, setUser] = useState(null);
  const [ethBalance, setEthBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        const userId = loggedInUser._id;
        const response = await fetch(`http://localhost:3001/user/${userId}`);
        const userData = await response.json();
        setUser(userData.user);
        setLoading(false);
      } catch (error) {
        setError('Error fetching user data');
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  useEffect(() => {
    const fetchEthBalance = async () => {
      if (user && user.etheriumAddress) {
        try {
          const userBalance = await web3.eth.getBalance(user.etheriumAddress);
          setEthBalance(web3.utils.fromWei(userBalance, 'ether'));
        } catch (error) {
          console.error('Error fetching Ethereum balance:', error);
          setError('Error fetching Ethereum balance');
        }
      }
    };

    fetchEthBalance();
  }, [user]);

  const copyAddressToClipboard = () => {
    navigator.clipboard.writeText(user.etheriumAddress);
    setCopied(true);
    toast.info('Address copied to clipboard', { position: 'top-right' });
  };

  return (
    <div className="max-w-4xl mx-auto mt-8 px-4 lg:px-0">
      {user && (
        <div>
          <div className="bg-white shadow-md rounded px-8 py-6 mb-4">
            <h2 className="text-2xl font-semibold mb-4">Profile</h2>
            <div>
              <div className="flex items-center mb-4">
                <div className="text-3xl text-blue-500 mr-4">
                  <FontAwesomeIcon icon={faUser} />
                </div>
                <div>
                  <p className="font-semibold text-lg">{user.username}</p>
                  <p className="text-gray-600">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center mb-4">
                <div className="text-3xl text-blue-500 mr-4">
                  <FontAwesomeIcon icon={faMapMarkerAlt} />
                </div>
                <div>
                  <p className="font-semibold">ETH Address:</p>
                  <p className="text-gray-600">{user.etheriumAddress}</p>
                  <button onClick={copyAddressToClipboard} className="text-blue-500 hover:text-blue-700 focus:outline-none">
                    <FontAwesomeIcon icon={faCopy} /> {copied ? 'Copied' : 'Copy Address'}
                  </button>
                </div>
              </div>
              <div className="flex items-center">
                <div className="text-3xl text-blue-500 mr-4">
                  <FontAwesomeIcon icon={faWallet} />
                </div>
                <div>
                  <p className="font-semibold">Wallet Balance:</p>
                  <p className="text-gray-600">{ethBalance} ETH</p>
                </div>
              </div>
            </div>
          </div>

          {/* Conditionally render RideHistory based on user type */}
          {loggedInUser.userType === 'user' && (
            <div className="bg-white shadow-md rounded px-8 py-6 mb-4">
              <RideHistory userId={user._id} />
            </div>
          )}

          {/* Conditionally render RideHistory based on user type */}
          {loggedInUser.userType === 'driver' && (
            <div className="bg-white shadow-md rounded px-8 py-6 mb-4">
              <RideHistory driverId={user._id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Profile;
