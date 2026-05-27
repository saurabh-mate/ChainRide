import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { pageVariants, pageTransition, staggerContainer, itemVariants } from '../components/Animations';

function Landing() {
  return (
    <motion.div 
      className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center pt-20 pb-20 overflow-hidden relative"
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
    >
      {/* Decorative ambient background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/20 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/20 blur-[120px]"></div>
      </div>

      <motion.div 
        className="z-10 text-center max-w-4xl px-4"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8">
          The Future of <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Ride-Sharing</span>
        </motion.h1>
        
        <motion.p variants={itemVariants} className="text-xl md:text-2xl text-slate-300 mb-12 max-w-2xl mx-auto leading-relaxed">
          ChainRide connects you instantly with drivers or lets you schedule carpools. 
          Powered by Blockchain for trustless payments and immutable reputation.
        </motion.p>
        
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <Link to="/auth">
             <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full font-bold text-lg shadow-lg shadow-blue-500/30 transition-shadow w-full sm:w-auto"
             >
                Get Started
             </motion.button>
          </Link>
          <Link to="/auth?role=driver">
             <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full font-bold text-lg backdrop-blur-sm transition-colors w-full sm:w-auto"
             >
                Drive with Us
             </motion.button>
          </Link>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default Landing;
