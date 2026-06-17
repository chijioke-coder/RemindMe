// src/pages/LandingPage.jsx
// Marketing homepage - sells the product before asking for signup

import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Set hasVisited flag in localStorage when someone visits
  

  return (
    <div className="min-h-screen bg-black">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-black/90 backdrop-blur-md border-b border-white/10 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-neonBlue font-black text-2xl">RemindMe</h1>
            <p className="text-zinc-500 text-[8px] uppercase tracking-widest">No-Show Protection</p>
          </div>
          
          <div className="hidden md:flex gap-8 items-center">
            <a href="#features" className="text-zinc-400 hover:text-white text-sm">Features</a>
            <a href="#how-it-works" className="text-zinc-400 hover:text-white text-sm">How It Works</a>
            <a href="#pricing" className="text-zinc-400 hover:text-white text-sm">Pricing</a>
            <Link to="/login" className="text-zinc-400 hover:text-white text-sm">Sign In</Link>
            <Link to="/signup" className="bg-neonBlue text-black px-5 py-2 rounded-lg font-bold text-sm hover:bg-cyan-400 transition">
              Start Free Trial
            </Link>
          </div>
          
          <button 
            className="md:hidden text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            ☰
          </button>
        </div>
        
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-zinc-900 border-t border-white/10 p-4 flex flex-col gap-4">
            <a href="#features" className="text-zinc-400 hover:text-white">Features</a>
            <a href="#how-it-works" className="text-zinc-400 hover:text-white">How It Works</a>
            <a href="#pricing" className="text-zinc-400 hover:text-white">Pricing</a>
            <Link to="/login" className="text-zinc-400 hover:text-white">Sign In</Link>
            <Link to="/signup" className="bg-neonBlue text-black text-center px-5 py-2 rounded-lg font-bold">
              Start Free Trial
            </Link>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center">
          <div className="inline-block bg-neonBlue/10 border border-neonBlue/30 rounded-full px-4 py-1 mb-6">
            <span className="text-neonBlue text-xs font-bold">✨ 14-Day Free Trial</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white mb-6">
            Stop Losing Money From
            <span className="text-neonBlue"> No-Shows</span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
            Automatic WhatsApp reminders reduce no-shows by 80%. 
            Your customers get reminded. You get paid.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup" className="bg-neonBlue text-black px-8 py-4 rounded-xl font-bold text-lg hover:bg-cyan-400 transition">
              Start 14-Day Free Trial
            </Link>
            <a href="#how-it-works" className="border border-white/20 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-white/5 transition">
              Watch Demo
            </a>
          </div>
          <p className="text-zinc-500 text-sm mt-4">No credit card required. Cancel anytime.</p>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-zinc-950">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-black text-neonBlue mb-2">80%</div>
              <div className="text-white font-bold">Reduction in No-Shows</div>
              <div className="text-zinc-500 text-sm">Average across all businesses</div>
            </div>
            <div>
              <div className="text-4xl font-black text-neonBlue mb-2">10,000+</div>
              <div className="text-white font-bold">Appointments Reminded</div>
              <div className="text-zinc-500 text-sm">And counting</div>
            </div>
            <div>
              <div className="text-4xl font-black text-neonBlue mb-2">$497</div>
              <div className="text-white font-bold">Saved per Month (Avg)</div>
              <div className="text-zinc-500 text-sm">From prevented no-shows</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Everything You Need</h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">Simple, powerful tools to manage your appointments</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-6">
              <div className="w-12 h-12 bg-neonBlue/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">📱</span>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">WhatsApp Reminders</h3>
              <p className="text-zinc-400 text-sm">Automatic messages 24 hours before appointments. Customers can confirm or cancel.</p>
            </div>
            
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-6">
              <div className="w-12 h-12 bg-neonBlue/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">📊</span>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">Simple Dashboard</h3>
              <p className="text-zinc-400 text-sm">Add appointments, track confirmations, see how much money you've saved.</p>
            </div>
            
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-6">
              <div className="w-12 h-12 bg-neonBlue/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">📈</span>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">Analytics</h3>
              <p className="text-zinc-400 text-sm">Track no-shows, confirmations, and see your savings over time.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 bg-zinc-950">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">How It Works</h2>
            <p className="text-zinc-400">Takes less than 5 minutes to set up</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-neonBlue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-black text-neonBlue">1</span>
              </div>
              <h3 className="text-white font-bold mb-2">Sign Up</h3>
              <p className="text-zinc-400 text-sm">Create your free account in 30 seconds</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-neonBlue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-black text-neonBlue">2</span>
              </div>
              <h3 className="text-white font-bold mb-2">Add Appointments</h3>
              <p className="text-zinc-400 text-sm">Enter customer name, phone, date, time</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-neonBlue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-black text-neonBlue">3</span>
              </div>
              <h3 className="text-white font-bold mb-2">Watch No-Shows Drop</h3>
              <p className="text-zinc-400 text-sm">Customers get reminders, show up, you save money</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Simple Pricing</h2>
            <p className="text-zinc-400">Start free, pay only when you're ready</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-8">
              <h3 className="text-white font-bold text-xl mb-2">Monthly</h3>
              <div className="text-4xl font-black text-neonBlue mb-4">$49</div>
              <p className="text-zinc-400 text-sm mb-6">per month. Cancel anytime.</p>
              <ul className="space-y-3 mb-8">
                <li className="text-white text-sm flex items-center gap-2">✓ Unlimited appointments</li>
                <li className="text-white text-sm flex items-center gap-2">✓ WhatsApp reminders</li>
                <li className="text-white text-sm flex items-center gap-2">✓ Customer management</li>
                <li className="text-white text-sm flex items-center gap-2">✓ Analytics dashboard</li>
                <li className="text-white text-sm flex items-center gap-2">✓ Email support</li>
              </ul>
              <Link to="/signup" className="block text-center bg-neonBlue text-black py-3 rounded-lg font-bold">
                Start Free Trial
              </Link>
            </div>
            
            <div className="bg-gradient-to-br from-neonBlue/10 to-purple-500/10 border border-neonBlue/30 rounded-xl p-8">
              <div className="inline-block bg-neonBlue/20 text-neonBlue text-xs px-2 py-1 rounded mb-4">Best Value</div>
              <h3 className="text-white font-bold text-xl mb-2">Yearly</h3>
              <div className="text-4xl font-black text-neonBlue mb-2">$490</div>
              <p className="text-zinc-400 text-sm mb-6">Save $98 compared to monthly</p>
              <ul className="space-y-3 mb-8">
                <li className="text-white text-sm flex items-center gap-2">✓ Everything in Monthly</li>
                <li className="text-white text-sm flex items-center gap-2">✓ 2 months free</li>
                <li className="text-white text-sm flex items-center gap-2">✓ Priority support</li>
              </ul>
              <Link to="/signup" className="block text-center bg-neonBlue text-black py-3 rounded-lg font-bold">
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-neonBlue/20 to-purple-500/20">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Ready to Stop Losing Money?</h2>
          <p className="text-zinc-300 mb-8 max-w-2xl mx-auto">
            Join hundreds of businesses using RemindMe to reduce no-shows and increase revenue.
          </p>
          <Link to="/signup" className="bg-neonBlue text-black px-8 py-4 rounded-xl font-bold text-lg inline-block hover:bg-cyan-400 transition">
            Start Your 14-Day Free Trial
          </Link>
          <p className="text-zinc-500 text-sm mt-4">No credit card required. Cancel anytime.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-white/10">
        <div className="container mx-auto text-center text-zinc-500 text-sm">
          <p>&copy; 2024 RemindMe. All rights reserved.</p>
          <p className="mt-2">
            <a href="#" className="hover:text-white mx-2">Privacy</a>
            <a href="#" className="hover:text-white mx-2">Terms</a>
            <a href="#" className="hover:text-white mx-2">Contact</a>
          </p>
        </div>
      </footer>
    </div>
  )
}