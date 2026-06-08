// src/pages/LandingPage.jsx
// No workers, no complex animations

import React from 'react'
import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-black/90 border-b border-white/10 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-neonBlue font-black text-2xl">RemindMe</h1>
          <div className="flex gap-4">
            <Link to="/login" className="text-zinc-400 hover:text-white">Sign In</Link>
            <Link to="/signup" className="bg-neonBlue text-black px-4 py-2 rounded-lg font-bold">
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="container mx-auto px-4 pt-32 pb-20 text-center">
        <h1 className="text-4xl md:text-6xl font-black text-white mb-4">
          Stop Losing Money From <span className="text-neonBlue">No-Shows</span>
        </h1>
        <p className="text-xl text-zinc-400 mb-8 max-w-2xl mx-auto">
          Automatic WhatsApp reminders reduce no-shows by 80%. Your customers get reminded. You get paid.
        </p>
        <Link 
          to="/signup" 
          className="bg-neonBlue text-black px-8 py-4 rounded-xl font-bold text-lg inline-block hover:bg-cyan-400 transition"
        >
          Start 14-Day Free Trial
        </Link>
        <p className="text-zinc-500 text-sm mt-4">No credit card required. Cancel anytime.</p>
      </div>

      {/* Features Section */}
      <div className="bg-zinc-950 py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-black text-white text-center mb-12">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 text-center">
              <div className="text-4xl mb-4">📱</div>
              <h3 className="text-white font-bold text-lg mb-2">WhatsApp Reminders</h3>
              <p className="text-zinc-400 text-sm">Automatic messages 24 hours before appointments</p>
            </div>
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 text-center">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-white font-bold text-lg mb-2">Simple Dashboard</h3>
              <p className="text-zinc-400 text-sm">Add appointments, track confirmations, see savings</p>
            </div>
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 text-center">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-white font-bold text-lg mb-2">Save Money</h3>
              <p className="text-zinc-400 text-sm">Reduce no-shows by 80% instantly</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-black text-white mb-4">Simple Pricing</h2>
        <div className="max-w-md mx-auto bg-zinc-900 border border-white/10 rounded-xl p-8">
          <div className="text-4xl font-black text-neonBlue mb-2">$49</div>
          <p className="text-zinc-400 mb-6">per month. Cancel anytime.</p>
          <Link to="/signup" className="block bg-neonBlue text-black py-3 rounded-lg font-bold">
            Start 14-Day Free Trial
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center text-zinc-500 text-sm">
        <p>&copy; 2024 RemindMe. All rights reserved.</p>
      </footer>
    </div>
  )
}