import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';
import 'react-toastify/dist/ReactToastify.css';

const Register = ({ setLoggedInUser }) => {
  const [formData, setFormData] = useState({
    username:'',
    email: '',
    password: '',
    contact: '',
    userType: 'user',
    address: '',
    currentLocation: ''
  });

  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Get current location when component mounts
    getCurrentLocation();
  }, []);

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => {
          const { latitude, longitude } = position.coords;
          setFormData({ ...formData, currentLocation: `${latitude},${longitude}` });
        },
        error => {
          console.error('Error getting location:', error);
          // Handle errors here
        }
      );
    } else {
      console.error('Geolocation is not supported by this browser.');
      // Handle unsupported browser here
    }
  };

  const handleRegister = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post('http://localhost:3001/register', formData);
      const { user, message } = response.data;
      localStorage.setItem('loggedInUser', JSON.stringify(user));
      setLoggedInUser(user);
      setMessage(message); // Set the success message state
      toast.success(
        <div>
          <FiCheckCircle className="inline-block mr-2" />
          {message}
        </div>,
        { position: 'top-right' }
      );
      console.log('Registration successful:', message);
    } catch (error) {
      console.error('Error registering:', error);
      if (error.response) {
        setMessage(error.response.data.message); // Set the error message state
        toast.error(
          <div>
            <FiAlertCircle className="inline-block mr-2" />
            {error.response.data.message}
          </div>,
          { position: 'top-right' }
        );
        console.error('Registration failed:', error.response.data.message);
      } else {
        setMessage('Error registering user. Please try again.'); // Set a generic error message
        toast.error(
          <div>
            <FiAlertCircle className="inline-block mr-2" />
            Error registering user. Please try again.
          </div>,
          { position: 'top-right' }
        );
        console.error('Registration failed: Error registering user. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold mb-4">Register</h2>
      <input
        type="email"
        name="email"
        value={formData.email}
        onChange={handleChange}
        placeholder="Email"
        className="w-full mb-4 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
      />
      <input
        type="password"
        name="password"
        value={formData.password}
        onChange={handleChange}
        placeholder="Password"
        className="w-full mb-4 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
      />
      <input
        type="text"
        name="username"
        value={formData.username}
        onChange={handleChange}
        placeholder="Name"
        className="w-full mb-4 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
      />
      <input
        type="text"
        name="contact"
        value={formData.contact}
        onChange={handleChange}
        placeholder="Mobile Number"
        className="w-full mb-4 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
      />
      <select
        name="userType"
        value={formData.userType}
        onChange={handleChange}
        className="w-full mb-4 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
      >
        <option value="user">User</option>
        <option value="driver">Driver</option>
      </select>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleRegister}
        disabled={isLoading}
        className={`w-full bg-blue-500 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md focus:outline-none focus:shadow-outline ${
          isLoading ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {isLoading ? 'Registering...' : 'Register'} {isLoading ? <FiAlertCircle className="inline-block ml-1" /> : <FiCheckCircle className="inline-block ml-1" />}
      </motion.button>

      {message && <p className="text-green-500 mb-4">{message}</p>}

      <p className="mt-4 text-center">
        Already have an account? <Link to="/login" className="text-blue-500 hover:underline">Login here</Link>
      </p>
    </div>
  );
};

export default Register;
