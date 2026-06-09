// supabase/functions/auth/index.ts
// CORRECTED VERSION – Uses bcrypt from a Deno-compatible source

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.2.4/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()
    
    // Get request body
    const body = await req.json()
    
    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    // ============================================================
    // SIGNUP ENDPOINT
    // ============================================================
    if (path === 'signup') {
      const { business_name, email, password, whatsapp_phone } = body
      
      // Validate input
      if (!business_name || !email || !password || !whatsapp_phone) {
        return new Response(
          JSON.stringify({ error: 'All fields are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Check if business already exists
      const { data: existing } = await supabase
        .from('businesses')
        .select('email')
        .eq('email', email)
        .maybeSingle()
      
      if (existing) {
        return new Response(
          JSON.stringify({ error: 'Business already registered with this email' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Hash password using Deno-compatible bcrypt
      const salt = await bcrypt.genSalt(10)
      const hashedPassword = await bcrypt.hash(password, salt)
      
      // Calculate trial end date (14 days from now)
      const trialEndsAt = new Date()
      trialEndsAt.setDate(trialEndsAt.getDate() + 14)
      
      // Insert new business
      const { data: business, error: insertError } = await supabase
        .from('businesses')
        .insert({
          business_name,
          email,
          hashed_password: hashedPassword,
          whatsapp_phone,
          trial_ends_at: trialEndsAt.toISOString(),
          subscription_status: 'trial'
        })
        .select()
        .single()
      
      if (insertError) {
        console.error('Insert error:', insertError)
        return new Response(
          JSON.stringify({ error: insertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const sessionToken = crypto.randomUUID()
      
      return new Response(
        JSON.stringify({
          success: true,
          business: {
            id: business.id,
            business_name: business.business_name,
            email: business.email,
            subscription_status: business.subscription_status,
            trial_ends_at: business.trial_ends_at
          },
          session_token: sessionToken
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ============================================================
    // LOGIN ENDPOINT
    // ============================================================
    if (path === 'login') {
      const { email, password } = body
      
      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: 'Email and password required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Get business by email
      const { data: business, error: findError } = await supabase
        .from('businesses')
        .select('*')
        .eq('email', email)
        .maybeSingle()
      
      if (!business || findError) {
        return new Response(
          JSON.stringify({ error: 'Invalid email or password' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Verify password
      const passwordValid = await bcrypt.compare(password, business.hashed_password)
      
      if (!passwordValid) {
        return new Response(
          JSON.stringify({ error: 'Invalid email or password' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const sessionToken = crypto.randomUUID()
      
      await supabase
        .from('businesses')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', business.id)
      
      return new Response(
        JSON.stringify({
          success: true,
          business: {
            id: business.id,
            business_name: business.business_name,
            email: business.email,
            subscription_status: business.subscription_status,
            trial_ends_at: business.trial_ends_at,
            whatsapp_phone: business.whatsapp_phone
          },
          session_token: sessionToken
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})