import React, { useState } from 'react';
import axios from 'axios';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiArrowRightCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';
import 'react-toastify/dist/ReactToastify.css';

const Login = ({ setLoggedInUser }) => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post('http://localhost:3001/login', formData);
      const { user } = response.data;
      localStorage.setItem('loggedInUser', JSON.stringify(user));
      setLoggedInUser(user);
      toast.success('Login successful', { position: 'top-right' });
    } catch (error) {
      console.error('Error logging in:', error);
      const errorMessage = error.response?.data?.message || 'Error logging in';
      toast.error(`Error logging in: ${errorMessage}`, { position: 'top-right' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const loggedInUser = JSON.parse(localStorage.getItem('loggedInUser'));

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold mb-4">Login</h2>
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
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleLogin}
        disabled={isLoading}
        className={`w-full bg-blue-500 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md focus:outline-none focus:shadow-outline ${
          isLoading ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {isLoading ? 'Logging in...' : 'Login'} <FiArrowRightCircle className="inline-block ml-1" />
      </motion.button>
      <p className="mt-4 text-center">
        Don't have an account? <Link to="/register" className="text-blue-500 hover:underline">Register here</Link>
      </p>
      {loggedInUser && (
        loggedInUser.userType === 'user' ? <Navigate to="/user-dashboard" /> : <Navigate to="/driver-dashboard" />
      )}
    </div>
  );
};

export default Login;
