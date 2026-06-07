// src/pages/Auth.jsx
// This file handles business signup and login

import React, { useState } from 'react'

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  
  // Signup form state
  const [businessName, setBusinessName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [whatsappPhone, setWhatsappPhone] = useState('')
  
  // Error state
  const [error, setError] = useState('')

  // Handle Login
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Login failed')
      }
      
      // Save session to sessionStorage
      sessionStorage.setItem('business_session', JSON.stringify({
        business: data.business,
        session_token: data.session_token
      }))
      
      // Redirect to dashboard
      window.location.href = '/dashboard'
      
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Handle Signup
  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    // Validate passwords match
    if (signupPassword !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }
    
    // Validate password length
    if (signupPassword.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }
    
    // Validate WhatsApp number format (basic)
    const whatsappRegex = /^\+\d{10,15}$/
    if (!whatsappRegex.test(whatsappPhone)) {
      setError('WhatsApp number must include country code (e.g., +1234567890)')
      setLoading(false)
      return
    }
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName,
          email: signupEmail,
          password: signupPassword,
          whatsapp_phone: whatsappPhone
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Signup failed')
      }
      
      // Save session to sessionStorage
      sessionStorage.setItem('business_session', JSON.stringify({
        business: data.business,
        session_token: data.session_token
      }))
      
      // Redirect to dashboard
      window.location.href = '/dashboard'
      
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <h1 className="text-neonBlue font-black text-3xl mb-2">RemindMe</h1>
          <p className="text-zinc-500 text-sm">
            {isLogin 
              ? 'Sign in to your account' 
              : 'Start your 14-day free trial'}
          </p>
        </div>
        
        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}
        
        {/* Trial Offer Banner (only on signup) */}
        {!isLogin && (
          <div className="bg-gradient-to-r from-neonBlue/10 to-purple-500/10 border border-neonBlue/30 rounded-lg p-4 mb-6 text-center">
            <p className="text-neonBlue text-sm font-bold">✨ 14-Day Free Trial</p>
            <p className="text-zinc-400 text-xs mt-1">No credit card required. Cancel anytime.</p>
          </div>
        )}
        
        {/* Login Form */}
        {isLogin ? (
          <form onSubmit={handleLogin} className="space-y-4">
           <div>
  <label className="block text-zinc-400 text-sm mb-2">Email Address</label>
  <input
    type="email"
    value={signupEmail}
    onChange={(e) => setSignupEmail(e.target.value)}
    className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white focus:border-neonBlue outline-none transition"
    placeholder="any@email.com (Gmail, Yahoo, or business email)"
    required
  />
  <p className="text-zinc-500 text-xs mt-1">Any email works. We'll send login links and receipts here.</p>
</div>
            
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white focus:border-neonBlue outline-none transition"
                placeholder="••••••••"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-neonBlue text-black font-bold py-3 rounded-lg hover:bg-cyan-400 transition disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            
            <p className="text-center text-zinc-500 text-sm mt-4">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className="text-neonBlue hover:underline"
              >
                Start free trial
              </button>
            </p>
          </form>
        ) : (
          // Signup Form
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Business Name</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white focus:border-neonBlue outline-none transition"
                placeholder="Your Salon, Clinic, or Spa"
                required
              />
            </div>
            
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Email Address</label>
              <input
                type="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white focus:border-neonBlue outline-none transition"
                placeholder="you@business.com"
                required
              />
            </div>
            
            <div>
              <label className="block text-zinc-400 text-sm mb-2">WhatsApp Business Number</label>
              <input
                type="tel"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white focus:border-neonBlue outline-none transition"
                placeholder="+1234567890 (include country code)"
                required
              />
              <p className="text-zinc-500 text-xs mt-1">
                Customers will receive reminders from this number
              </p>
            </div>
            
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Password</label>
              <input
                type="password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white focus:border-neonBlue outline-none transition"
                placeholder="At least 6 characters"
                required
              />
            </div>
            
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white focus:border-neonBlue outline-none transition"
                placeholder="••••••••"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-neonBlue text-black font-bold py-3 rounded-lg hover:bg-cyan-400 transition disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Start 14-Day Free Trial'}
            </button>
            
            <p className="text-center text-zinc-500 text-sm mt-4">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className="text-neonBlue hover:underline"
              >
                Sign in
              </button>
            </p>
          </form>
        )}
        
        {/* Footer */}
        <p className="text-center text-zinc-600 text-xs mt-8">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}