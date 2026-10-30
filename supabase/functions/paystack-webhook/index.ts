// PaBs Media — Paystack webhook: credits a wallet when a payment succeeds.
// Deploy as an Edge Function named: paystack-webhook
// IMPORTANT: turn OFF "Verify JWT" for this function (Paystack has no Supabase token).
// Then set this URL as the webhook in Paystack Dashboard -> Settings -> API Keys & Webhooks:
//   https://<project-ref>.supabase.co/functions/v1/paystack-webhook
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return new Response('not configured', { status: 500 });
  const raw = await req.text();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  if (sig !== req.headers.get('x-paystack-signature')) return new Response('bad signature', { status: 401 });

  const event = JSON.parse(raw);
  if (event.event === 'charge.success') {
    const { reference, amount } = event.data;
    const { error } = await db.rpc('credit_topup', { p_reference: reference, p_amount: amount });
    if (error) console.error('credit_topup', error.message);
  }
  return new Response('ok');
});
