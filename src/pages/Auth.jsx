// src/pages/Auth.jsx
// Fixed: separate state, password visibility, better UX

import React, { useState } from 'react'

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Separate state for login and signup forms
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [signupBusinessName, setSignupBusinessName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupWhatsapp, setSignupWhatsapp] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirm, setSignupConfirm] = useState('')

  const API_URL = import.meta.env.VITE_API_URL
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

  // Handle Login
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Login failed')
      sessionStorage.setItem('business_session', JSON.stringify({
        business: data.business,
        session_token: data.session_token
      }))
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

    if (signupPassword !== signupConfirm) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }
    if (signupPassword.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }
    const whatsappRegex = /^\+\d{10,15}$/
    if (!whatsappRegex.test(signupWhatsapp)) {
      setError('WhatsApp number must include country code (e.g., +1234567890)')
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          business_name: signupBusinessName,
          email: signupEmail,
          password: signupPassword,
          whatsapp_phone: signupWhatsapp
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Signup failed')
      sessionStorage.setItem('business_session', JSON.stringify({
        business: data.business,
        session_token: data.session_token
      }))
      window.location.href = '/dashboard'
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Switch between login/signup – clear only the form you're leaving? Actually leave as is, but separate states ensure no overlap.
  // No need to clear anything because states are separate.

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-neonBlue font-black text-3xl mb-2">RemindMe</h1>
          <p className="text-zinc-500 text-sm">
            {isLogin ? 'Sign in to your account' : 'Start your 14-day free trial'}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        {!isLogin && (
          <div className="bg-gradient-to-r from-neonBlue/10 to-purple-500/10 border border-neonBlue/30 rounded-lg p-4 mb-6 text-center">
            <p className="text-neonBlue text-sm font-bold">✨ 14-Day Free Trial</p>
            <p className="text-zinc-400 text-xs mt-1">No credit card required. Cancel anytime.</p>
          </div>
        )}

        {isLogin ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white"
                placeholder="any@email.com (e.g., hello@company.com)"
                required
              />
              <p className="text-zinc-500 text-xs mt-1">Any valid email works. We'll send login links and receipts.</p>
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-neonBlue text-black font-bold py-3 rounded-lg">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <p className="text-center text-zinc-500 text-sm">
              Don't have an account?{' '}
              <button type="button" onClick={() => setIsLogin(false)} className="text-neonBlue">
                Start free trial
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Business Name</label>
              <input
                type="text"
                value={signupBusinessName}
                onChange={(e) => setSignupBusinessName(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white"
                placeholder="Your Salon, Clinic, or Spa"
                required
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Email</label>
              <input
                type="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white"
                placeholder="any@email.com (e.g., hello@company.com)"
                required
              />
              <p className="text-zinc-500 text-xs mt-1">Any valid email works. We'll send login links and receipts.</p>
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-2">WhatsApp Number (with country code)</label>
              <input
                type="tel"
                value={signupWhatsapp}
                onChange={(e) => setSignupWhatsapp(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white"
                placeholder="+1234567890"
                required
              />
              <p className="text-zinc-500 text-xs mt-1">Include country code, e.g., +1 for US, +44 for UK</p>
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Confirm Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={signupConfirm}
                  onChange={(e) => setSignupConfirm(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white pr-10"
                  required
                />
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-neonBlue text-black font-bold py-3 rounded-lg">
              {loading ? 'Creating account...' : 'Start 14-Day Free Trial'}
            </button>
            <p className="text-center text-zinc-500 text-sm">
              Already have an account?{' '}
              <button type="button" onClick={() => setIsLogin(true)} className="text-neonBlue">
                Sign in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}