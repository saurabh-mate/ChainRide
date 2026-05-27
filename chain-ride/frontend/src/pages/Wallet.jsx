import React, { useContext } from 'react';
import { Web3Context } from '../context/Web3Context';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { pageVariants, pageTransition } from '../components/Animations';
import { FiChevronLeft, FiDownload, FiUpload, FiActivity } from 'react-icons/fi';

function Wallet() {
  const navigate = useNavigate();
  const { account, connectWallet } = useContext(Web3Context);

  return (
    <motion.div 
      className="min-h-screen bg-slate-50 p-4 md:p-8"
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
    >
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate(-1)} className="p-2 bg-white rounded-full text-slate-600 hover:bg-slate-100 shadow-sm transition-colors">
            <FiChevronLeft size={24} />
          </button>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Wallet & Earnings</h1>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Balance Card */}
          <motion.div 
            whileHover={{ y: -5 }}
            className="md:col-span-2 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-8 shadow-xl relative overflow-hidden"
          >
            {/* Decoration */}
            <div className="absolute right-[-10%] top-[-10%] w-[50%] h-[150%] bg-white/5 rotate-12 pointer-events-none"></div>
            
            <p className="text-slate-400 font-medium mb-1">Total Balance</p>
            <h2 className="text-4xl md:text-5xl font-extrabold mb-8 tracking-tight">₹ 12,450<span className="text-xl text-slate-400 font-medium">.00</span></h2>
            
            <div className="flex gap-4">
              <button className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-semibold transition-colors">
                <FiDownload /> Withdraw
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl font-semibold transition-colors">
                <FiUpload /> Top Up
              </button>
            </div>
          </motion.div>

          {/* Crypto Connect */}
          <motion.div 
            whileHover={{ y: -5 }}
            className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center"
          >
            <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mb-4">
              <FiActivity size={32} />
            </div>
            <h3 className="font-bold text-slate-800 mb-2">Web3 Wallet</h3>
            <p className="text-sm text-slate-500 mb-4">
              {account ? `Connected: ${account.substring(0,6)}...${account.substring(account.length - 4)}` : 'Connect Metamask for decentralized payments.'}
            </p>
            <button 
              onClick={connectWallet}
              className={`w-full py-2 rounded-lg font-semibold transition-colors ${account ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'} text-white`}
            >
              {account ? 'Connected' : 'Connect'}
            </button>
          </motion.div>
        </div>

        {/* Tx History */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-lg text-slate-800 mb-6">Recent Transactions</h3>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex justify-between items-center py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 rounded-lg px-2 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${i===1 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {i===1 ? <FiDownload /> : <FiUpload />}
                  </div>
                  <div>
                    <h4 className="font-medium text-slate-800">{i===1 ? 'Ride Payment' : 'Platform Fee'}</h4>
                    <p className="text-xs text-slate-500">Today, {10-i}:00 AM</p>
                  </div>
                </div>
                <div className={`font-bold ${i===1 ? 'text-green-600' : 'text-slate-800'}`}>
                  {i===1 ? '+ ₹450.00' : '- ₹10.00'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default Wallet;
