import React from 'react';
import { Web3Provider } from './context/Web3Context';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Landing     from './pages/Landing';
import Auth        from './pages/Auth';
import Dashboard   from './pages/Dashboard';
import RideSearch  from './pages/RideSearch';
import Wallet      from './pages/Wallet';
import Profile     from './pages/Profile';
import LiveTracking from './pages/LiveTracking';
import OfferRide   from './pages/OfferRide';
import CarpoolRides from './pages/CarpoolRides';

// 404 Not Found page
function NotFound() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-extrabold text-blue-500 mb-4">404</div>
        <h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
        <p className="text-slate-400 mb-8">The page you're looking for doesn't exist.</p>
        <a
          href="/dashboard"
          className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition-colors"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}

// Public-only route — redirect logged-in users away from /auth
function PublicOnlyRoute({ children }) {
  const token = localStorage.getItem('token');
  if (token) return <Navigate to="/dashboard" replace />;
  return children;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={
          <PublicOnlyRoute>
            <Auth />
          </PublicOnlyRoute>
        } />

        {/* Protected routes — require JWT */}
        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />
        <Route path="/ride" element={
          <ProtectedRoute><RideSearch /></ProtectedRoute>
        } />
        <Route path="/offer-ride" element={
          <ProtectedRoute><OfferRide /></ProtectedRoute>
        } />
        <Route path="/carpool" element={
          <ProtectedRoute><CarpoolRides /></ProtectedRoute>
        } />
        <Route path="/wallet" element={
          <ProtectedRoute><Wallet /></ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute><Profile /></ProtectedRoute>
        } />
        <Route path="/live" element={
          <ProtectedRoute><LiveTracking /></ProtectedRoute>
        } />

        {/* 404 catch-all */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <Web3Provider>
      <ErrorBoundary>
        <Router>
          <AnimatedRoutes />
        </Router>
      </ErrorBoundary>
    </Web3Provider>
  );
}

export default App;
