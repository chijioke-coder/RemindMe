// src/pages/Auth.jsx
// Complete working version – uses Authorization header (not apikey)

import React, { useState } from 'react'

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [whatsappPhone, setWhatsappPhone] = useState('')

  // Environment variables
  const API_URL = import.meta.env.VITE_API_URL
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

  // ============================================================
  // SIGNUP - Edge Function with Authorization header
  // ============================================================
  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    const whatsappRegex = /^\+\d{10,15}$/
    if (!whatsappRegex.test(whatsappPhone)) {
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
          business_name: businessName,
          email: email,
          password: password,
          whatsapp_phone: whatsappPhone
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed')
      }

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

  // ============================================================
  // LOGIN - Edge Function with Authorization header
  // ============================================================
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
        body: JSON.stringify({
          email: email,
          password: password
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Login failed')
      }

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

  // ============================================================
  // DEBUG BUTTON - Tests Edge Function directly
  // ============================================================
  const testEdgeFunction = async () => {
    const url = `${API_URL}/auth/signup`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          business_name: 'DebugTest',
          email: 'debug@test.com',
          password: '123456',
          whatsapp_phone: '+1234567890'
        })
      })
      const text = await res.text()
      alert(`Status: ${res.status}\nResponse: ${text}\n\nURL: ${url}`)
    } catch (err) {
      alert(`Fetch error: ${err.message}\n\nURL: ${url}\n\nAPI_URL: ${API_URL || 'undefined'}\n\nANON_KEY present: ${SUPABASE_ANON_KEY ? 'Yes' : 'No'}`)
    }
  }

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

        {/* DEBUG BUTTON */}
        <button
          onClick={testEdgeFunction}
          className="mb-6 w-full bg-yellow-500 text-black py-2 rounded-lg font-bold text-sm"
        >
          🧪 Test Edge Function
        </button>

        {isLogin ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white"
                required
              />
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
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white"
                placeholder="any@email.com"
                required
              />
              <p className="text-zinc-500 text-xs mt-1">Any email works (Gmail, Yahoo, etc.)</p>
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-2">WhatsApp Number (with country code)</label>
              <input
                type="tel"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white"
                placeholder="+1234567890"
                required
              />
              <p className="text-zinc-500 text-xs mt-1">Include country code, e.g., +1 for US, +44 for UK</p>
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-white"
                required
              />
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