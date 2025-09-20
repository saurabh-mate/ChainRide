import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import GIF from '../assets/ride.gif';
import ArrivedGIF from '../assets/arrived.gif';

const RideStatusPage = () => {
  const [rideDetails, setRideDetails] = useState(null);
  const [progress, setProgress] = useState(0);
  const [showArrived, setShowArrived] = useState(false);
  const [showResult, setShowResult] = useState(false);
  let statusInterval;

  useEffect(() => {
    const rideId = localStorage.getItem('acceptedRideId');
    const checkStatus = async () => {
      try {
        const response = await axios.get(`http://localhost:3001/rides/${rideId}`);
        const status = response.data.ride.ride_status;
        setRideDetails(response.data.ride)
        if (status === 'done') {
          setShowArrived(true);
          clearInterval(statusInterval); // Stop checking status once status is done
          localStorage.removeItem('acceptedRideId'); // Remove rideId from localStorage
        }
      } catch (error) {
        console.error('Error fetching ride status:', error);
      }
    };

    if (rideId) {
      statusInterval = setInterval(checkStatus, 1000); // Check status every 1 second
      return () => clearInterval(statusInterval);
    }
  }, []);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress(prevProgress => {
        if (prevProgress === 100) {
          clearInterval(progressInterval);
          setShowResult(true); // Show result after progress completes
        }
        return prevProgress + 10;
      });
    }, 1000);

    return () => clearInterval(progressInterval);
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-xl font-semibold mb-4">Ride Status</h2>
      <div className="flex items-center justify-center">
        <div className="w-1/2">
          {rideDetails && (
            <div className="bg-white rounded-lg shadow-md p-4 mb-4">
              <p className="text-lg font-semibold mb-2">Ride Details</p>
              <p>Ride ID: {rideDetails._id}</p>
              <p>User ID: {rideDetails.user_id}</p>
              <p>Ride Location: {rideDetails.ride_location}</p>
              <p>Ride Fare: {rideDetails.ride_fare}</p>
              <p>Ride Status: {rideDetails.ride_status}</p>
            </div>
          )}
          <img src={GIF} alt="Ride GIF" className="mb-4" style={{ display: showArrived ? 'none' : 'block' }} />
          {showArrived && (
            <div className="bg-white rounded-lg shadow-md p-4 mb-4">
              <img src={ArrivedGIF} alt="Arrived GIF" className="mb-4" />
              <p className="text-lg font-bold">Arrived <FontAwesomeIcon icon={faCheckCircle} /></p>
            </div>
          )}
          {/* {showResult && (
            <div className="bg-gray-200 h-6 w-full mb-4 relative rounded-full">
              <div className="bg-blue-500 h-6 rounded-full" style={{ width: `${progress}%` }}></div>
            </div>
          )} */}
        </div>
      </div>
    </div>
  );
};

export default RideStatusPage;
