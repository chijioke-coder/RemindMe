// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const errorMsg = 'Missing Supabase environment variables! Check Vercel settings.'
  console.error(errorMsg)
  // Show error on screen if possible
  if (typeof document !== 'undefined') {
    const div = document.createElement('div')
    div.style.cssText = 'position:fixed;bottom:10px;left:10px;right:10px;background:red;color:white;padding:10px;z-index:9999;font-size:12px;'
    div.innerText = errorMsg
    document.body.appendChild(div)
  }
}

export const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_ANON_KEY || 'placeholder', {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
})

export const getCurrentBusiness = () => {
  try {
    const session = sessionStorage.getItem('business_session')
    return session ? JSON.parse(session) : null
  } catch (e) {
    console.error('Failed to parse business session', e)
    return null
  }
}

export const isAuthenticated = () => !!getCurrentBusiness()

export const getAuthHeaders = () => {
  const session = getCurrentBusiness()
  if (!session) return {}
  return {
    'Authorization': `Bearer ${session.session_token}`,
    'Content-Type': 'application/json'
  }
}

export const getBusinessId = () => getCurrentBusiness()?.business?.id || null

export const logout = () => {
  sessionStorage.removeItem('business_session')
  window.location.href = '/login'
}

export const isSubscriptionActive = () => {
  const session = getCurrentBusiness()
  if (!session?.business) return false
  const status = session.business.subscription_status
  if (status === 'active') return true
  if (status === 'trial') {
    const trialEnds = new Date(session.business.trial_ends_at)
    return trialEnds > new Date()
  }
  return false
}

export const getTrialDaysLeft = () => {
  const session = getCurrentBusiness()
  if (!session?.business?.trial_ends_at) return 0
  const trialEnds = new Date(session.business.trial_ends_at)
  const diffDays = Math.ceil((trialEnds - new Date()) / (1000 * 60 * 60 * 24))
  return diffDays > 0 ? diffDays : 0
}