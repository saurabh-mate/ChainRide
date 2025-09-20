import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Register from './components/Register';
import Login from './components/Login';
import Profile from './components/Profile';
import UserDashboard from './components/UserDashboard';
import DriverDashboard from './components/DriverDashboard';
import Header from './components/Header';
import { ToastContainer } from 'react-toastify';
import RideStatusPage from './components/RideStatusPage';
import HomePage from './components/HomePage';

const App = () => {
  const [loggedInUser, setLoggedInUser] = useState(JSON.parse(localStorage.getItem('loggedInUser')) || null);

  return (
    <Router>
      <div>
        <Header loggedInUser={loggedInUser} setLoggedInUser={setLoggedInUser} />
        <div className="container mx-auto mt-8">
          <Routes>
          <Route path="/" element={<HomePage />} /> {/* Route for Home Page */}
            {/* <Route path="/login" element={<Navigate to="/login" />} /> */}
            <Route path="/register" element={<Register setLoggedInUser={setLoggedInUser} />} />
            <Route path="/login" element={<Login setLoggedInUser={setLoggedInUser} />} />


            <Route
              path="/profile"
              element={
                loggedInUser ? (
                  <Profile loggedInUser={loggedInUser} />
                ) : (
                  <Navigate to="/login" />
                )
              }
            />

            
            <Route
              path="/user-dashboard"
              element={loggedInUser && loggedInUser.userType === 'user' ? <UserDashboard /> : <Navigate to="/login" />}
            />
            <Route path="/ride-status/:rideId" element={<RideStatusPage />} />
            <Route
              path="/driver-dashboard"
              element={
                loggedInUser && loggedInUser.userType === 'driver' ? <DriverDashboard /> : <Navigate to="/login" />
              }
            />
            <Route path="/logout" element={<Navigate to="/" />} />
          </Routes>
          <ToastContainer />
        </div>
      </div>
    </Router>
  );
};

export default App;
