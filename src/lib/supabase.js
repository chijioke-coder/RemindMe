// src/lib/supabase.js
// This file creates the Supabase client for your React app

import { createClient } from '@supabase/supabase-js'

// These values come from your Supabase project
// You will replace these with your actual values after deployment
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate environment variables
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables!')
  console.error('Make sure .env file has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false, // We're using our own session management
    autoRefreshToken: false
  }
})

// Helper function to get current business session
export const getCurrentBusiness = () => {
  const session = sessionStorage.getItem('business_session')
  if (!session) return null
  try {
    return JSON.parse(session)
  } catch {
    return null
  }
}

// Helper function to check if business is authenticated
export const isAuthenticated = () => {
  return getCurrentBusiness() !== null
}

// Helper function to get auth headers for API calls
export const getAuthHeaders = () => {
  const session = getCurrentBusiness()
  if (!session) return {}
  return {
    'Authorization': `Bearer ${session.session_token}`,
    'Content-Type': 'application/json'
  }
}

// Helper function to get business ID
export const getBusinessId = () => {
  const session = getCurrentBusiness()
  if (!session?.business?.id) return null
  return session.business.id
}

// Helper function to logout
export const logout = () => {
  sessionStorage.removeItem('business_session')
  window.location.href = '/login'
}

// Helper function to check subscription status
export const isSubscriptionActive = () => {
  const session = getCurrentBusiness()
  if (!session?.business) return false
  
  const status = session.business.subscription_status
  if (status === 'active') return true
  if (status === 'trial') {
    const trialEnds = new Date(session.business.trial_ends_at)
    const now = new Date()
    return trialEnds > now
  }
  return false
}

// Helper function to get days left in trial
export const getTrialDaysLeft = () => {
  const session = getCurrentBusiness()
  if (!session?.business?.trial_ends_at) return 0
  
  const trialEnds = new Date(session.business.trial_ends_at)
  const now = new Date()
  const diffTime = trialEnds - now
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays > 0 ? diffDays : 0
}