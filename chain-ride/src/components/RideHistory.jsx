import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarAlt, faMapMarkerAlt, faMoneyBillAlt, faCheckCircle, faAngleDown, faAngleUp } from '@fortawesome/free-solid-svg-icons';

const RideHistory = ({ userId, driverId }) => {
  const [rideHistory, setRideHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedRideId, setExpandedRideId] = useState(null);

  useEffect(() => {
    const fetchRideHistory = async () => {
      setLoading(true);
      try {
        let response;
        if (userId) {
          response = await axios.get(`http://localhost:3001/ride-history/user/${userId}`);
        } else if (driverId) {
          response = await axios.get(`http://localhost:3001/ride-history/driver/${driverId}`);
        }
        setRideHistory(response.data.rideHistory);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching ride history:', error);
        setError('Failed to fetch ride history');
        setLoading(false);
      }
    };

    fetchRideHistory();
  }, [userId, driverId]);

  const toggleDropdown = (rideId) => {
    setExpandedRideId((prevId) => (prevId === rideId ? null : rideId));
  };

  if (loading) {
    return (
      <div className="text-center mt-4">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return <p>{error}</p>;
  }

  return (
    <div>
      <h2 className="text-blue-500 mb-4">Ride History</h2>
      {rideHistory.map((ride, index) => (
        <div key={ride._id}>
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center" onClick={() => toggleDropdown(ride._id)}>
              <div>
                <FontAwesomeIcon icon={faCalendarAlt} className="text-blue-500" /> Ride Date: {new Date(ride.ride_date).toLocaleString()}
              </div>
              <FontAwesomeIcon icon={expandedRideId === ride._id ? faAngleUp : faAngleDown} className="text-blue-500" />
            </div>
            {index !== rideHistory.length - 1 && <hr className="my-3" />}
          </div>
          {expandedRideId === ride._id && (
            <div className="card-body">
              <p><FontAwesomeIcon icon={faMapMarkerAlt} className="text-blue-500" /> Ride Location: {ride.ride_location}</p>
              <p><FontAwesomeIcon icon={faMoneyBillAlt} className="text-blue-500" /> Ride Fare: {ride.ride_fare}</p>
              <p><FontAwesomeIcon icon={faCheckCircle} className="text-blue-500" /> Ride Status: {ride.ride_status}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default RideHistory;
