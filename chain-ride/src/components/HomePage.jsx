import React from 'react';
import { motion } from 'framer-motion';

const HomePage = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      {/* Road background SVG */}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320" className="absolute bottom-0 z-0">
        <path fill="#000000" fillOpacity="1" d="M0,128L48,149.3C96,171,192,213,288,218.7C384,224,480,192,576,160C672,128,768,96,864,90.7C960,85,1056,107,1152,144C1248,181,1344,235,1392,261.3L1440,288L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
      </svg>

      {/* ChainRide app name */}
      <motion.h1
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 1 }}
        className="text-4xl font-bold text-gray-800 mb-8"
      >
        ChainRide
      </motion.h1>

      {/* Slogan */}
      <motion.p
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 1 }}
        className="text-lg text-gray-600 mb-12"
      >
        The secure and robust blockchain app for ridesharing.
      </motion.p>

      {/* Icons or additional content here */}

      {/* Example of additional content */}
      {/* <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 1 }}
        className="flex space-x-4"
      >
        <FontAwesomeIcon icon={faCar} size="2x" className="text-blue-500" />
        <FontAwesomeIcon icon={faUser} size="2x" className="text-blue-500" />
        <FontAwesomeIcon icon={faMapMarkerAlt} size="2x" className="text-blue-500" />
      </motion.div> */}
    </div>
  );
};

export default HomePage;
