import { useAuth } from '../lib/auth';

export default function Support() {
  const { settings } = useAuth();
  const wa = settings?.support_whatsapp?.replace(/\D/g, '');
  return (
    <>
      <h1 style={{ fontSize: '2rem' }}>Support</h1>
      <div className="panel stack">
        <p>Something wrong with an order or a payment? Message us with the order time and the email you signed up with.</p>
        {wa ? <a className="btn" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">Chat on WhatsApp</a>
          : <p className="muted">Support contact details will appear here soon.</p>}
      </div>
      <div className="panel stack-s">
        <h2>Common questions</h2>
        <p><b>My payment is not showing.</b> Open Wallet and wait a minute. Payments are credited automatically once Paystack confirms them.</p>
        <p><b>My order failed.</b> You are refunded to your wallet automatically. Nothing is lost.</p>
        <p><b>Where are my details?</b> Open Orders and tap View details on the completed order.</p>
      </div>
    </>
  );
}
