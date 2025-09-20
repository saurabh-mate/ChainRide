import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faCar } from '@fortawesome/free-solid-svg-icons';
import { toast } from 'react-toastify';
import '@fortawesome/fontawesome-svg-core/styles.css';
import transferEther from '../utils/transferEther';
import { useNavigate } from 'react-router-dom';
import RideStatusPage from './RideStatusPage';

const DriverDashboard = () => {
  const [requestedRides, setRequestedRides] = useState([]);
  const [acceptedRideId, setAcceptedRideId] = useState(null); 
  const navigate = useNavigate();

  const loggedInUser = JSON.parse(localStorage.getItem('loggedInUser')) ?? {};
const driverAddress = loggedInUser?.etheriumAddress ?? null;


  useEffect(() => {
    fetchRequestedRides();
  }, []);

  const fetchRequestedRides = async () => {
    try {
      const response = await axios.get('http://localhost:3001/requested-rides');
      setRequestedRides(response.data.requestedRides);
    } catch (error) {
      console.error('Error fetching requested rides:', error);
    }
  };



  {console.log(requestedRides)}

  const acceptRide = async (rideId, userId, fareAmount, userAdd, ride) => {
    try {
      const userAddress = userAdd;
      const driverId = loggedInUser ? loggedInUser._id : null;
      
      const response = await axios.post('http://localhost:3001/accept-ride', { rideId, driverId, userId, fareAmount, userAdd, userAddress });
      console.log(response.data)
      const updatedRequestedRides = requestedRides.map(r => {
        if (r._id === rideId) {
          return { ...r, ride_status: 'accepted' };
        }
        return r;
      });
      
      setRequestedRides(updatedRequestedRides);
  
      // Store the accepted ride ID in local storage
      localStorage.setItem('acceptedRideId', rideId);
  
      console.log("User Add:",userAddress)
      console.log("Fare",fareAmount)
      console.log("Driver Address",driverAddress)

      const transactionDetails = await transferEther(userAddress,driverAddress,fareAmount);
      console.log(transactionDetails)
      toast.success('Ride accepted successfully!', { icon: <FontAwesomeIcon icon={faCheckCircle} />, autoClose: 3000 });
      
      // Set the acceptedRideId state here
      setAcceptedRideId(rideId);
      navigate(`/ride-status/${rideId}`);
      console.log(rideId);
  
    } catch (error) {
      console.error('Error accepting ride:', error);
      toast.error('Error accepting ride. Please try again later.');
    }
  };

  

  return (
    <div className="container mx-auto p-4">
      {requestedRides.length === 0 ? (
        <div className="text-center">
          <p className="text-lg mb-2">No ride requests available.</p>
          <p className="text-lg mb-2">Take a break or check back later!</p>
          <FontAwesomeIcon icon={faCar} size="4x" className="text-blue-500" />
        </div>
      ) : (
        <div className="w-full max-w-lg">
          <h2 className="text-xl font-semibold mb-4">Requested Rides</h2>
          {requestedRides.map((ride) => (
            <div key={ride._id} className="border rounded-lg p-4 mb-4 shadow-md">
              <p>{ride._id}</p>
              <p className="text-lg font-semibold mb-2">Requested By: {ride.user_id.username.toUpperCase()}</p>
              <p className="text-gray-600">Contact No: {ride.user_id.contact}</p>
              <p className="text-gray-600">Source: {ride.ride_location}</p>
              <p className="text-gray-600">Fare: {ride.ride_fare}</p>
              <button onClick={() => acceptRide(ride._id, ride.user_id._id, ride.ride_fare, ride.user_id.etheriumAddress, ride)} className="bg-blue-500 text-white px-4 py-2 mt-2 rounded-md hover:bg-blue-600 transition duration-300">
                Accept Ride
              </button>
            </div>
          ))}
        </div>
      )}

      {acceptedRideId && <RideStatusPage isDriver={true}/>}
    </div>
  );
};

export default DriverDashboard;


