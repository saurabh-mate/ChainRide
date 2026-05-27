/**
 * ProtectedRoute — redirects to /auth if no JWT token in localStorage.
 * Wraps pages that require authentication.
 */
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  const location = useLocation();

  if (!token) {
    // Redirect to /auth, saving the intended URL
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return children;
}

export default ProtectedRoute;
