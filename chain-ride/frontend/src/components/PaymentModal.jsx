import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCheckCircle, FiSmartphone, FiDollarSign, FiGlobe, FiX, FiHome, FiStar, FiSend } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../utils/api';

const STAR_LABELS = ['', 'Terrible', 'Poor', 'Okay', 'Great', 'Amazing!'];
const QUICK_TAGS = ['Smooth ride', 'Great driver', 'Clean car', 'On time', 'Polite', 'Safe driving'];

function PaymentModal({ isOpen, onClose, fare, driverUpi, driverCustomQr, showCompletion, driverMode, rideId, driverName, isCarpool }) {
  const navigate = useNavigate();

  // Rating state (passenger feedback after ride completion)
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [ratingError, setRatingError] = useState('');

  // Driver: selected payment method at ride end
  const [selectedPmt, setSelectedPmt] = useState('UPI');
  const [driverConfirming, setDriverConfirming] = useState(false);

  const safeFare = Number(fare || 0);
  const safeUpi = driverUpi || '';
  const upiIntentURL = `upi://pay?pa=${safeUpi}&pn=Driver&am=${safeFare}&cu=INR`;

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmitRating = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    setRatingError('');
    try {
      const fullComment = [...selectedTags, comment].filter(Boolean).join('. ');
      const endpoint = isCarpool ? `/offered-rides/${rideId}/rate` : `/rides/${rideId}/rate`;
      await apiPost(endpoint, { rating, comment: fullComment });
      setFeedbackDone(true);
    } catch (err) {
      setRatingError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoHome = () => {
    onClose();
    navigate('/dashboard');
  };

  const handleDriverConfirm = () => {
    // Payment was already collected at booking time.
    // Just confirm ride completion — no money changes hands here.
    setDriverConfirming(true);
    setTimeout(() => {
      setDriverConfirming(false);
      onClose();
      navigate('/dashboard');
    }, 800);
  };

  const activeStar = hoveredStar || rating;
  const starColors = [
    '',
    'text-red-400',
    'text-orange-400',
    'text-yellow-400',
    'text-lime-400',
    'text-green-400',
  ];

  if (!isOpen) return null;

  // ── PASSENGER: Ride complete — show rating ─────────────────────────────────
  if (showCompletion && !driverMode) {
    return (
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative"
            initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }}
          >
            <button onClick={handleGoHome} className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full text-slate-400 z-10 transition">
              <FiX size={20} />
            </button>

            {feedbackDone ? (
              /* ── Success after rating ── */
              <motion.div className="flex flex-col items-center justify-center p-10"
                initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 15 }}
              >
                <motion.div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-5"
                  initial={{ rotate: -180 }} animate={{ rotate: 0 }}
                  transition={{ type: 'spring', damping: 12 }}
                >
                  <motion.svg width="48" height="48" viewBox="0 0 50 50" initial="hidden" animate="visible">
                    <motion.circle cx="25" cy="25" r="22" className="stroke-green-500" strokeWidth="3" fill="transparent"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5 }} />
                    <motion.path d="M15 25 L22 32 L35 18" className="stroke-green-500" strokeWidth="4" fill="transparent" strokeLinecap="round" strokeLinejoin="round"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5, duration: 0.4 }} />
                  </motion.svg>
                </motion.div>
                <h3 className="text-xl font-bold text-slate-800 mb-1">Thanks for your feedback!</h3>
                <p className="text-slate-500 text-sm mb-6">Your rating helps improve the community.</p>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={handleGoHome}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all"
                >
                  <FiHome size={18} /> Go Home
                </motion.button>
              </motion.div>
            ) : (
              /* ── Rating form ── */
              <div className="p-6 pb-5">
                <div className="flex flex-col items-center mb-6">
                  <motion.div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-3"
                    initial={{ scale: 0.5 }} animate={{ scale: 1 }}
                  >
                    <motion.svg width="40" height="40" viewBox="0 0 50 50" initial="hidden" animate="visible">
                      <motion.circle cx="25" cy="25" r="22" className="stroke-green-500" strokeWidth="3" fill="transparent"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5 }} />
                      <motion.path d="M15 25 L22 32 L35 18" className="stroke-green-500" strokeWidth="4" fill="transparent" strokeLinecap="round" strokeLinejoin="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5, duration: 0.4 }} />
                    </motion.svg>
                  </motion.div>
                  <h2 className="text-xl font-bold text-slate-800">Ride Completed!</h2>
                  <p className="text-slate-500 text-sm mt-1">
                    Rate your experience with <span className="font-semibold text-slate-700">{driverName || 'Driver'}</span>
                  </p>
                </div>

                {/* Stars */}
                <div className="flex justify-center gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <motion.button key={star}
                      onMouseEnter={() => setHoveredStar(star)}
                      onMouseLeave={() => setHoveredStar(0)}
                      onClick={() => setRating(star)}
                      whileHover={{ scale: 1.25 }} whileTap={{ scale: 0.9 }}
                      className="p-1 transition-colors"
                    >
                      <motion.div
                        animate={star <= activeStar ? { scale: [1, 1.3, 1], rotate: [0, -10, 10, 0] } : {}}
                        transition={{ duration: 0.3 }}
                      >
                        <FiStar size={36}
                          className={`transition-colors duration-200 ${star <= activeStar ? `${starColors[activeStar]} fill-current` : 'text-slate-200'}`}
                        />
                      </motion.div>
                    </motion.button>
                  ))}
                </div>

                {/* Star label */}
                <AnimatePresence mode="wait">
                  {activeStar > 0 && (
                    <motion.p key={activeStar} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                      className={`text-center font-semibold text-sm mb-4 ${starColors[activeStar]}`}
                    >
                      {STAR_LABELS[activeStar]}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Quick tags + comment */}
                <AnimatePresence>
                  {rating > 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-wrap gap-2 justify-center mb-4 mt-2">
                        {QUICK_TAGS.map((tag, i) => (
                          <motion.button key={tag} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05 }} onClick={() => toggleTag(tag)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                              selectedTags.includes(tag)
                                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                            }`}
                          >
                            {tag}
                          </motion.button>
                        ))}
                      </div>
                      <textarea value={comment} onChange={(e) => setComment(e.target.value)}
                        placeholder="Add a comment (optional)..." rows={2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:bg-white transition-all resize-none mb-2" />
                      {ratingError && <p className="text-red-500 text-sm text-center mb-2">{ratingError}</p>}
                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={handleSubmitRating} disabled={submitting || rating === 0}
                        className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {submitting ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</> : <><FiSend size={16} /> Submit Rating</>}
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {rating === 0 && <p className="text-center text-slate-400 text-sm mt-4">Tap a star to rate</p>}

                {rating > 0 && (
                  <button onClick={handleGoHome}
                    className="w-full mt-3 py-2 text-slate-500 text-sm hover:text-slate-700 transition"
                  >
                    Skip for now
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── DRIVER: Ride complete — show fare + confirm ────────────────────────────
  // (passenger payment was already collected at booking time)
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative"
          initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }}
        >
          <button onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full text-slate-400 cursor-pointer transition z-10">
            <FiX size={24} />
          </button>

          <div className="p-6">
            {/* Fare + status */}
            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                <FiCheckCircle size={32} className="text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Ride Completed!</h2>
              <p className="text-slate-500 text-sm mt-1">Fare collected for this trip.</p>
            </div>

            {/* Fare amount */}
            <div className="bg-slate-50 rounded-2xl p-5 mb-6 text-center border border-slate-100">
              <p className="text-slate-500 text-sm mb-1">Total Fare</p>
              <p className="text-4xl font-extrabold text-slate-900">₹{safeFare.toFixed(2)}</p>
            </div>

            {/* Payment method paid at booking */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                  {selectedPmt === 'UPI' || selectedPmt === 'online' ? <FiSmartphone size={18} className="text-blue-600" /> :
                   selectedPmt === 'Cash' ? <FiDollarSign size={18} className="text-green-600" /> :
                   <FiGlobe size={18} className="text-purple-600" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Payment collected at booking</p>
                  <p className="text-xs text-slate-400">No cash handling needed. Ride fare is already paid.</p>
                </div>
              </div>
            </div>

            {/* Confirm button */}
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={handleDriverConfirm}
              disabled={driverConfirming}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {driverConfirming ? (
                <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Confirming...</>
              ) : (
                <><FiCheckCircle size={18} /> Done — Find Next Passenger</>
              )}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default PaymentModal;
