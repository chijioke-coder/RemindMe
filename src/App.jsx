// src/App.jsx
// Main application router - handles all pages

import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated } from './lib/supabase'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'

// Protected Route component
// Redirects to login if not authenticated
const ProtectedRoute = ({ children }) => {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return children
}

// Public Route component
// Redirects to dashboard if already authenticated
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
        {/* Public Routes - accessible without login */}
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <Auth />
            </PublicRoute>
          } 
        />
        <Route 
          path="/signup" 
          element={
            <PublicRoute>
              <Auth />
            </PublicRoute>
          } 
        />
        
        {/* Protected Routes - require login */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        
        {/* Redirect root to dashboard if logged in, otherwise login */}
        <Route 
          path="/" 
          element={
            isAuthenticated() 
              ? <Navigate to="/dashboard" replace />
              : <Navigate to="/login" replace />
          } 
        />
        
        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App