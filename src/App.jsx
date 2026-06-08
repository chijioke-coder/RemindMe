// src/App.jsx
import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated } from './lib/supabase'
import LandingPage from './pages/LandingPage'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'

// Check if user has visited before
const hasVisitedBefore = () => {
  return localStorage.getItem('hasVisitedBefore') === 'true'
}

// Landing Route - shows landing page ONLY for first-time visitors
const LandingRoute = () => {
  if (hasVisitedBefore()) {
    return <Navigate to="/login" replace />
  }
  return <LandingPage />
}

// Protected Route - requires login
const ProtectedRoute = ({ children }) => {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return children
}

// Public Route - if already logged in, go to dashboard
const PublicRoute = ({ children }) => {
  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingRoute />} />
        <Route path="/login" element={<PublicRoute><Auth /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><Auth /></PublicRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App