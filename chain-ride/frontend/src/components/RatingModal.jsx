import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiStar, FiSend, FiHome } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../utils/api';

const STAR_LABELS = ['', 'Terrible', 'Poor', 'Okay', 'Great', 'Amazing!'];
const QUICK_TAGS = ['Smooth ride', 'Great driver', 'Clean car', 'On time', 'Polite', 'Safe driving'];

function RatingModal({ isOpen, onClose, rideId, driverName }) {
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const fullComment = [...selectedTags, comment].filter(Boolean).join('. ');
      await apiPost(`/rides/${rideId}/rate`, { rating, comment: fullComment });
      setSubmitted(true);
      setTimeout(() => {
        onClose();
        navigate('/ride');
      }, 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const goToHome = () => {
    onClose();
    navigate('/ride');
  };

  if (!isOpen) return null;

  const activeStar = hoveredStar || rating;

  const starColors = [
    '', // index 0 unused
    'text-red-400',
    'text-orange-400',
    'text-yellow-400',
    'text-lime-400',
    'text-green-400',
  ];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative"
          initial={{ scale: 0.85, y: 40 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.85, y: 40 }}
          transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full text-slate-400 z-10 transition"
          >
            <FiX size={20} />
          </button>

          {submitted ? (
            /* ── Success State ── */
            <motion.div
              className="flex flex-col items-center justify-center p-10"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15 }}
            >
              <motion.div
                className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-5"
                initial={{ rotate: -180 }}
                animate={{ rotate: 0 }}
                transition={{ type: 'spring', damping: 12 }}
              >
                <motion.svg
                  width="48" height="48" viewBox="0 0 50 50"
                  initial="hidden" animate="visible"
                >
                  <motion.circle
                    cx="25" cy="25" r="22"
                    className="stroke-green-500" strokeWidth="3" fill="transparent"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5 }}
                  />
                  <motion.path
                    d="M15 25 L22 32 L35 18"
                    className="stroke-green-500" strokeWidth="4" fill="transparent"
                    strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ delay: 0.5, duration: 0.4 }}
                  />
                </motion.svg>
              </motion.div>
              <h3 className="text-xl font-bold text-slate-800 mb-1">Thanks for your feedback!</h3>
              <p className="text-slate-500 text-sm mb-6">Your rating helps improve the community.</p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={goToHome}
                className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all"
              >
                <FiHome size={18} />
                Go to Home
              </motion.button>
            </motion.div>
          ) : (
            /* ── Rating Form ── */
            <div className="p-6 pb-5">
              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
                  <span className="text-2xl font-bold text-white">
                    {driverName?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-800">How was your ride?</h2>
                <p className="text-slate-500 text-sm mt-1">
                  Rate your experience with <span className="font-semibold text-slate-700">{driverName || 'Driver'}</span>
                </p>
              </div>

              {/* Stars */}
              <div className="flex justify-center gap-2 mb-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <motion.button
                    key={star}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(0)}
                    onClick={() => setRating(star)}
                    whileHover={{ scale: 1.25 }}
                    whileTap={{ scale: 0.9 }}
                    className="p-1 transition-colors"
                  >
                    <motion.div
                      animate={star <= activeStar ? { scale: [1, 1.3, 1], rotate: [0, -10, 10, 0] } : {}}
                      transition={{ duration: 0.3 }}
                    >
                      <FiStar
                        size={36}
                        className={`transition-colors duration-200 ${
                          star <= activeStar
                            ? `${starColors[activeStar]} fill-current`
                            : 'text-slate-200'
                        }`}
                      />
                    </motion.div>
                  </motion.button>
                ))}
              </div>

              {/* Star Label */}
              <AnimatePresence mode="wait">
                {activeStar > 0 && (
                  <motion.p
                    key={activeStar}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className={`text-center font-semibold text-sm mb-4 ${starColors[activeStar]?.replace('text-', 'text-')}`}
                  >
                    {STAR_LABELS[activeStar]}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Quick Tags */}
              <AnimatePresence>
                {rating > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap gap-2 justify-center mb-4 mt-2">
                      {QUICK_TAGS.map((tag, i) => (
                        <motion.button
                          key={tag}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                          onClick={() => toggleTag(tag)}
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

                    {/* Comment Box */}
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a comment (optional)..."
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:bg-white transition-all resize-none mb-2"
                    />

                    {/* Error */}
                    {error && (
                      <p className="text-red-500 text-sm text-center mb-2">{error}</p>
                    )}

                    {/* Submit */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleSubmit}
                      disabled={submitting || rating === 0}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Submitting...
                        </span>
                      ) : (
                        <>
                          <FiSend size={16} /> Submit Rating
                        </>
                      )}
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

              {rating === 0 && (
                <p className="text-center text-slate-400 text-sm mt-4">Tap a star to rate</p>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default RatingModal;
