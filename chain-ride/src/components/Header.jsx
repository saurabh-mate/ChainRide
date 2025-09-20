import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserCircle, faSignInAlt, faSignOutAlt, faUserPlus, faUser } from '@fortawesome/free-solid-svg-icons';

const Header = ({ loggedInUser, setLoggedInUser }) => {
  const handleLogout = () => {
    localStorage.removeItem('loggedInUser');
    setLoggedInUser(null);
  };

  const appName = (
    <motion.span whileHover={{ scale: 1.1 }} className="cursor-pointer">
      <span className="text-blue-500 hover:text-gray-300">C</span>
      <span className="text-red-500 hover:text-gray-300">h</span>
      <span className="text-yellow-500 hover:text-gray-300">a</span>
      <span className="text-green-500 hover:text-gray-300">i</span>
      <span className="text-purple-500 hover:text-gray-300">n</span>
      <span className="text-blue-500 hover:text-gray-300">R</span>
      <span className="text-red-500 hover:text-gray-300">i</span>
      <span className="text-yellow-500 hover:text-gray-300">d</span>
      <span className="text-green-500 hover:text-gray-300">e</span>
    </motion.span>
  );

  return (
    <header className="bg-white shadow py-4">
      <div className="container mx-auto flex justify-between items-center px-4">
        <h1 className="text-gray-800 text-xl font-bold">
          <Link to="/" className="hover:text-transparent">
            {appName}
          </Link>
        </h1>
        <nav>
          <ul className="flex items-center space-x-4">
            {!loggedInUser ? (
              <>
                <li>
                  <Link to="/login" className="text-blue-500 hover:text-gray-300">
                    <FontAwesomeIcon icon={faSignInAlt} />
                  </Link>
                </li>
                <li>
                  <Link to="/register" className="text-green-500 hover:text-gray-300">
                    <FontAwesomeIcon icon={faUserPlus} />
                  </Link>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link to={loggedInUser.userType === 'user' ? '/user-dashboard' : '/driver-dashboard'} className="text-yellow-500 hover:text-gray-300">
                    {loggedInUser.userType === 'user' ? 'User Dashboard' : 'Driver Dashboard'}
                  </Link>
                </li>
                <li>
                  <Link to="/profile" className="text-purple-500 hover:text-gray-300">
                    <FontAwesomeIcon icon={faUser} />
                  </Link>
                </li>
                <li>
                  <button onClick={handleLogout} className="text-red-500 hover:text-gray-300">
                    <FontAwesomeIcon icon={faSignOutAlt} />
                  </button>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;
