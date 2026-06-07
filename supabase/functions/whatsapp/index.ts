// supabase/functions/whatsapp/index.ts
// This handles sending WhatsApp messages via WhatsApp Cloud API

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// WhatsApp Cloud API configuration
// You will get these from Facebook Developer account
const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN') || ''
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || ''
const WHATSAPP_API_VERSION = 'v18.0'
const WHATSAPP_API_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()
    
    const body = await req.json()
    
    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    // ============================================================
    // SEND REMINDER ENDPOINT (Manual or Webhook)
    // ============================================================
    if (path === 'send') {
      const { appointment_id, business_id, customer_name, customer_phone, appointment_date, appointment_time, business_name } = body
      
      if (!customer_phone || !customer_name || !appointment_date || !appointment_time || !business_name) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Format phone number (remove spaces, ensure international format)
      let formattedPhone = customer_phone.replace(/\s/g, '')
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+' + formattedPhone
      }
      
      // Format date for message
      const formattedDate = new Date(appointment_date).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      })
      
      // Get business settings for custom message
      const { data: settings } = await supabase
        .from('business_settings')
        .select('reminder_message, reminder_hours')
        .eq('business_id', business_id)
        .single()
      
      let message = settings?.reminder_message || 'Reminder: You have an appointment with {business_name} on {date} at {time}. Reply CONFIRM to confirm or CANCEL to cancel.'
      
      // Replace placeholders
      message = message
        .replace('{business_name}', business_name)
        .replace('{date}', formattedDate)
        .replace('{time}', appointment_time)
      
      // Prepare WhatsApp message payload
      const whatsappPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      }
      
      // Send to WhatsApp API
      const response = await fetch(WHATSAPP_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(whatsappPayload)
      })
      
      const result = await response.json()
      
      // Log notification
      await supabase
        .from('notification_logs')
        .insert({
          business_id: business_id,
          appointment_id: appointment_id,
          notification_type: 'whatsapp',
          status: response.ok ? 'sent' : 'failed',
          error_message: response.ok ? null : JSON.stringify(result),
          sent_at: new Date().toISOString()
        })
      
      // Update appointment reminder_sent flag
      if (appointment_id) {
        await supabase
          .from('appointments')
          .update({ 
            reminder_sent: true, 
            reminder_sent_at: new Date().toISOString() 
          })
          .eq('id', appointment_id)
      }
      
      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: 'WhatsApp API error', details: result }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      return new Response(
        JSON.stringify({ success: true, message_id: result.messages?.[0]?.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ============================================================
    // WEBHOOK FOR CUSTOMER REPLIES (CONFIRM / CANCEL)
    // ============================================================
    if (path === 'webhook') {
      // WhatsApp sends POST requests to this endpoint
      const whatsappBody = body
      
      // Check if this is a status update or a message
      if (whatsappBody.entry?.[0]?.changes?.[0]?.value?.statuses) {
        // This is a message status update (delivered, read, etc.)
        return new Response('OK', { status: 200 })
      }
      
      // Process incoming messages
      const messages = whatsappBody.entry?.[0]?.changes?.[0]?.value?.messages
      
      if (messages && messages.length > 0) {
        for (const message of messages) {
          const from = message.from // Customer's phone number
          const text = message.text?.body?.toLowerCase().trim() || ''
          
          // Check if customer replied CONFIRM or CANCEL
          if (text === 'confirm' || text === 'confirmed' || text === 'yes') {
            // Find the appointment for this customer
            // Get the most recent upcoming appointment
            const { data: appointment } = await supabase
              .from('appointments')
              .select(`
                id,
                business_id,
                businesses (whatsapp_phone, business_name)
              `)
              .eq('customer_phone', from)
              .gte('appointment_date', new Date().toISOString().split('T')[0])
              .order('appointment_date', { ascending: true })
              .limit(1)
              .single()
            
            if (appointment) {
              // Update appointment as confirmed
              await supabase
                .from('appointments')
                .update({ 
                  customer_confirmed: true, 
                  confirmed_at: new Date().toISOString() 
                })
                .eq('id', appointment.id)
              
              // Notify business that customer confirmed
              const businessWhatsApp = appointment.businesses?.whatsapp_phone
              if (businessWhatsApp) {
                const confirmMessage = {
                  messaging_product: 'whatsapp',
                  recipient_type: 'individual',
                  to: businessWhatsApp,
                  type: 'text',
                  text: {
                    body: `✅ Customer confirmed their appointment for ${new Date().toLocaleDateString()}`
                  }
                }
                
                await fetch(WHATSAPP_API_URL, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(confirmMessage)
                })
              }
            }
          }
          
          if (text === 'cancel' || text === 'no') {
            // Find the appointment
            const { data: appointment } = await supabase
              .from('appointments')
              .select(`
                id,
                business_id,
                businesses (whatsapp_phone, business_name)
              `)
              .eq('customer_phone', from)
              .gte('appointment_date', new Date().toISOString().split('T')[0])
              .order('appointment_date', { ascending: true })
              .limit(1)
              .single()
            
            if (appointment) {
              // Update appointment as canceled
              await supabase
                .from('appointments')
                .update({ 
                  customer_canceled: true, 
                  canceled_at: new Date().toISOString() 
                })
                .eq('id', appointment.id)
              
              // Notify business that customer canceled
              const businessWhatsApp = appointment.businesses?.whatsapp_phone
              if (businessWhatsApp) {
                const cancelMessage = {
                  messaging_product: 'whatsapp',
                  recipient_type: 'individual',
                  to: businessWhatsApp,
                  type: 'text',
                  text: {
                    body: `❌ Customer CANCELED their appointment. Time slot is now available.`
                  }
                }
                
                await fetch(WHATSAPP_API_URL, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(cancelMessage)
                })
              }
            }
          }
        }
      }
      
      return new Response('OK', { status: 200 })
    }
    
    // ============================================================
    // SCHEDULED REMINDERS (Called by cron job)
    // ============================================================
    if (path === 'cron') {
      // Get all appointments happening tomorrow that haven't had a reminder sent
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowStr = tomorrow.toISOString().split('T')[0]
      
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          id,
          appointment_date,
          appointment_time,
          customer_id,
          business_id,
          customers (customer_name, customer_phone),
          businesses (business_name, whatsapp_phone, subscription_status)
        `)
        .eq('appointment_date', tomorrowStr)
        .eq('reminder_sent', false)
        .neq('subscription_status', 'canceled')
      
      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const results = []
      
      for (const apt of appointments || []) {
        // Only send if business subscription is active or in trial
        if (apt.businesses.subscription_status !== 'active' && apt.businesses.subscription_status !== 'trial') {
          continue
        }
        
        const reminderResult = await fetch(`${Deno.env.get('FUNCTION_URL')}/whatsapp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appointment_id: apt.id,
            business_id: apt.business_id,
            customer_name: apt.customers.customer_name,
            customer_phone: apt.customers.customer_phone,
            appointment_date: apt.appointment_date,
            appointment_time: apt.appointment_time,
            business_name: apt.businesses.business_name
          })
        })
        
        const result = await reminderResult.json()
        results.push({ appointment_id: apt.id, success: reminderResult.ok, result })
        
        // Wait 1 second between messages to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      return new Response(
        JSON.stringify({ success: true, processed: results.length, results }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})