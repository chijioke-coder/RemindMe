// src/pages/Dashboard.jsx
// This is the main dashboard where businesses manage appointments

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const [business, setBusiness] = useState(null)
  const [appointments, setAppointments] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('')
  const [notes, setNotes] = useState('')
  const [stats, setStats] = useState({
    total_appointments: 0,
    confirmed: 0,
    canceled: 0,
    no_shows: 0
  })

  // Load business data
  useEffect(() => {
    loadBusinessData()
    loadAppointments()
    loadCustomers()
  }, [])

  const loadBusinessData = async () => {
    const session = sessionStorage.getItem('business_session')
    if (!session) {
      window.location.href = '/login'
      return
    }
    
    const { business: businessData } = JSON.parse(session)
    setBusiness(businessData)
  }

  const loadAppointments = async () => {
    setLoading(true)
    const session = sessionStorage.getItem('business_session')
    const { business: businessData } = JSON.parse(session)
    
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        customers (
          customer_name,
          customer_phone
        )
      `)
      .eq('business_id', businessData.id)
      .order('appointment_date', { ascending: true })
    
    if (!error && data) {
      setAppointments(data)
      
      // Calculate stats
      const total = data.length
      const confirmed = data.filter(a => a.customer_confirmed).length
      const canceled = data.filter(a => a.customer_canceled).length
      const noShows = data.filter(a => a.no_show).length
      
      setStats({
        total_appointments: total,
        confirmed,
        canceled,
        no_shows: noShows
      })
    }
    setLoading(false)
  }

  const loadCustomers = async () => {
    const session = sessionStorage.getItem('business_session')
    const { business: businessData } = JSON.parse(session)
    
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('business_id', businessData.id)
      .order('customer_name', { ascending: true })
    
    if (!error && data) {
      setCustomers(data)
    }
  }

  const handleAddAppointment = async (e) => {
    e.preventDefault()
    
    const session = sessionStorage.getItem('business_session')
    const { business: businessData } = JSON.parse(session)
    
    let customerId = selectedCustomer
    
    // If creating new customer
    if (customerId === 'new') {
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          business_id: businessData.id,
          customer_name: newCustomerName,
          customer_phone: newCustomerPhone
        })
        .select()
        .single()
      
      if (customerError) {
        alert('Error creating customer: ' + customerError.message)
        return
      }
      
      customerId = newCustomer.id
      loadCustomers() // Refresh customer list
    }
    
    // Create appointment
    const { error: appointmentError } = await supabase
      .from('appointments')
      .insert({
        business_id: businessData.id,
        customer_id: customerId,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        notes: notes
      })
    
    if (appointmentError) {
      alert('Error creating appointment: ' + appointmentError.message)
    } else {
      alert('Appointment added successfully!')
      setShowAddModal(false)
      resetForm()
      loadAppointments()
    }
  }

  const resetForm = () => {
    setSelectedCustomer('')
    setNewCustomerName('')
    setNewCustomerPhone('')
    setAppointmentDate('')
    setAppointmentTime('')
    setNotes('')
  }

  const handleDeleteAppointment = async (id) => {
    if (!confirm('Delete this appointment?')) return
    
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id)
    
    if (error) {
      alert('Error deleting: ' + error.message)
    } else {
      loadAppointments()
    }
  }

  const handleMarkNoShow = async (id) => {
    const { error } = await supabase
      .from('appointments')
      .update({ no_show: true })
      .eq('id', id)
    
    if (error) {
      alert('Error updating: ' + error.message)
    } else {
      loadAppointments()
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const getStatusBadge = (appointment) => {
    if (appointment.customer_canceled) {
      return <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded-full text-xs">Canceled</span>
    }
    if (appointment.customer_confirmed) {
      return <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-xs">Confirmed</span>
    }
    if (appointment.no_show) {
      return <span className="bg-gray-500/20 text-gray-400 px-2 py-1 rounded-full text-xs">No Show</span>
    }
    if (appointment.reminder_sent) {
      return <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full text-xs">Reminder Sent</span>
    }
    return <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full text-xs">Pending</span>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-white/10 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-neonBlue font-black text-xl">RemindMe</h1>
            <p className="text-zinc-500 text-xs">{business?.business_name}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-white text-sm">
                {business?.subscription_status === 'trial' ? (
                  <span className="text-yellow-400">Trial • {Math.ceil((new Date(business.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24))} days left</span>
                ) : business?.subscription_status === 'active' ? (
                  <span className="text-green-400">Active</span>
                ) : (
                  <span className="text-red-400">Expired</span>
                )}
              </div>
              <button 
                onClick={() => {
                  sessionStorage.removeItem('business_session')
                  window.location.href = '/login'
                }}
                className="text-zinc-400 text-xs hover:text-white"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-zinc-900 border border-white/10 rounded-xl p-4">
            <div className="text-zinc-500 text-xs uppercase mb-1">Total Appointments</div>
            <div className="text-white text-2xl font-bold">{stats.total_appointments}</div>
          </div>
          <div className="bg-zinc-900 border border-white/10 rounded-xl p-4">
            <div className="text-zinc-500 text-xs uppercase mb-1">Confirmed</div>
            <div className="text-green-400 text-2xl font-bold">{stats.confirmed}</div>
          </div>
          <div className="bg-zinc-900 border border-white/10 rounded-xl p-4">
            <div className="text-zinc-500 text-xs uppercase mb-1">Canceled</div>
            <div className="text-red-400 text-2xl font-bold">{stats.canceled}</div>
          </div>
          <div className="bg-zinc-900 border border-white/10 rounded-xl p-4">
            <div className="text-zinc-500 text-xs uppercase mb-1">No Shows</div>
            <div className="text-gray-400 text-2xl font-bold">{stats.no_shows}</div>
          </div>
        </div>

        {/* Add Appointment Button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white font-bold text-lg">Upcoming Appointments</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-neonBlue text-black px-4 py-2 rounded-lg font-bold text-sm hover:bg-cyan-400 transition"
          >
            + Add Appointment
          </button>
        </div>

        {/* Appointments Table */}
        <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-black/50 border-b border-white/10">
                <tr>
                  <th className="text-left p-4 text-zinc-400 text-xs font-medium">Customer</th>
                  <th className="text-left p-4 text-zinc-400 text-xs font-medium">Phone</th>
                  <th className="text-left p-4 text-zinc-400 text-xs font-medium">Date</th>
                  <th className="text-left p-4 text-zinc-400 text-xs font-medium">Time</th>
                  <th className="text-left p-4 text-zinc-400 text-xs font-medium">Status</th>
                  <th className="text-left p-4 text-zinc-400 text-xs font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.filter(a => new Date(a.appointment_date) >= new Date()).length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center p-8 text-zinc-500">
                      No upcoming appointments. Click "Add Appointment" to get started.
                    </td>
                  </tr>
                ) : (
                  appointments
                    .filter(a => new Date(a.appointment_date) >= new Date())
                    .map((apt) => (
                      <tr key={apt.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-4 text-white">{apt.customers?.customer_name}</td>
                        <td className="p-4 text-zinc-400">{apt.customers?.customer_phone}</td>
                        <td className="p-4 text-white">{formatDate(apt.appointment_date)}</td>
                        <td className="p-4 text-white">{apt.appointment_time}</td>
                        <td className="p-4">{getStatusBadge(apt)}</td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            {!apt.customer_canceled && !apt.no_show && (
                              <button
                                onClick={() => handleMarkNoShow(apt.id)}
                                className="text-red-400 text-xs hover:text-red-300"
                              >
                                No Show
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteAppointment(apt.id)}
                              className="text-zinc-500 text-xs hover:text-white"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Past Appointments Section */}
        {appointments.filter(a => new Date(a.appointment_date) < new Date()).length > 0 && (
          <>
            <h2 className="text-white font-bold text-lg mt-8 mb-4">Past Appointments</h2>
            <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-black/50 border-b border-white/10">
                    <tr>
                      <th className="text-left p-4 text-zinc-400 text-xs">Customer</th>
                      <th className="text-left p-4 text-zinc-400 text-xs">Phone</th>
                      <th className="text-left p-4 text-zinc-400 text-xs">Date</th>
                      <th className="text-left p-4 text-zinc-400 text-xs">Time</th>
                      <th className="text-left p-4 text-zinc-400 text-xs">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments
                      .filter(a => new Date(a.appointment_date) < new Date())
                      .map((apt) => (
                        <tr key={apt.id} className="border-b border-white/5">
                          <td className="p-4 text-white">{apt.customers?.customer_name}</td>
                          <td className="p-4 text-zinc-400">{apt.customers?.customer_phone}</td>
                          <td className="p-4 text-white">{formatDate(apt.appointment_date)}</td>
                          <td className="p-4 text-white">{apt.appointment_time}</td>
                          <td className="p-4">{getStatusBadge(apt)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Add Appointment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-xl max-w-md w-full p-6">
            <h2 className="text-white font-bold text-lg mb-4">Add Appointment</h2>
            <form onSubmit={handleAddAppointment}>
              <div className="mb-4">
                <label className="block text-zinc-400 text-sm mb-2">Select Customer</label>
                <select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-lg p-3 text-white"
                  required
                >
                  <option value="">Choose a customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.customer_name} - {c.customer_phone}</option>
                  ))}
                  <option value="new">+ Add New Customer</option>
                </select>
              </div>
              
              {selectedCustomer === 'new' && (
                <>
                  <div className="mb-4">
                    <label className="block text-zinc-400 text-sm mb-2">Customer Name</label>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded-lg p-3 text-white"
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-zinc-400 text-sm mb-2">Customer Phone (with country code)</label>
                    <input
                      type="tel"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      placeholder="+1234567890"
                      className="w-full bg-black border border-white/10 rounded-lg p-3 text-white"
                      required
                    />
                  </div>
                </>
              )}
              
              <div className="mb-4">
                <label className="block text-zinc-400 text-sm mb-2">Appointment Date</label>
                <input
                  type="date"
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-lg p-3 text-white"
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-zinc-400 text-sm mb-2">Appointment Time</label>
                <input
                  type="time"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-lg p-3 text-white"
                  required
                />
              </div>
              
              <div className="mb-6">
                <label className="block text-zinc-400 text-sm mb-2">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows="2"
                  className="w-full bg-black border border-white/10 rounded-lg p-3 text-white"
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-zinc-800 text-white py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-neonBlue text-black py-3 rounded-lg font-bold"
                >
                  Add Appointment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}