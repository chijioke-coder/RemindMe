# PaBs Media

Reseller storefront + owner dashboard. Customers fund a wallet, buy, and the server buys from the supplier
(Sameeha's Socialhub API) on their behalf and shows the result on your site.

```
supabase/schema.sql                  database, wallet ledger, order functions, security rules
supabase/functions/api               order engine, supplier sync, payments, admin actions
supabase/functions/mock-supplier     fake supplier for safe testing
supabase/functions/paystack-webhook  credits wallets after payment
web/                                 React + Vite storefront and /admin dashboard
```

## Setup (no command line needed for the backend)

1. **Supabase project**: create one at supabase.com.
2. **Database**: SQL Editor → New query → paste all of `supabase/schema.sql` → Run.
3. **Auth**: Authentication → Providers → Email → turn OFF "Confirm email" while testing.
4. **Edge functions**: Edge Functions → Deploy a new function → "Via editor". Create three functions with
   these exact names and paste each `index.ts`: `api`, `mock-supplier`, `paystack-webhook`.
   Turn OFF "Verify JWT" for `paystack-webhook` only.
5. **Secrets**: Edge Functions → Secrets. Add:
   - `KEYS_ENCRYPTION_SECRET` = a long random string (32+ characters). Never change it after orders exist.
   - `SITE_URL` = your site address, e.g. `https://pabs-media.vercel.app`
   - later: `PAYSTACK_SECRET_KEY`, `UPSTREAM_BASE_URL` = `https://sameehasocialhub.com/api/v1`, `UPSTREAM_API_KEY`
6. **Frontend**: in `web/` copy `.env.example` to `.env`, fill in the project URL and anon key
   (Project Settings → API), then `npm install` and `npm run dev`. Deploy to Vercel with the same two variables.
7. **Make yourself owner**: sign up on the site, then in the SQL Editor run
   `update public.profiles set role = 'admin' where email = 'YOUR-EMAIL';` and reload. "Dashboard" appears in the menu.

## Test the automatic reselling (mock supplier, no real money)

Dashboard → **Test lab**. Supplier mode starts on Mock.
1. Tap *Sync catalogue*. Go to **Products**, switch a few on.
2. **Customers** → open your account → add test money.
3. Buy from the store. Then pick each scenario in Test lab and buy again. Every scenario lists what to expect:
   completed, auto-refund, paused purchases, or **Needs review** (supplier charged but no keys arrived).
4. Check **Orders**, **Customers** and **Activity** show everything.

## Going live

1. All Test lab scenarios behave as described.
2. Add `UPSTREAM_API_KEY` and `UPSTREAM_BASE_URL`, fund your wallet on the supplier site.
3. Test lab → *Use live*, sync, then make **one** small real purchase.
4. Add Paystack keys, set the webhook URL (see `paystack-webhook/index.ts`), test a small funding.
5. Set the support WhatsApp number and markup in Settings.

## Things to know

- Money is stored in kobo. The wallet is a ledger: every credit and debit is a row, and the balance can never go below zero.
- The supplier key and delivered keys never reach the browser. Keys are encrypted (AES-GCM) in the database and decrypted only for their owner or you.
- Only one supplier purchase runs at a time. If the supplier times out, the system compares the supplier wallet balance before and after: unchanged means automatic refund, reduced means "Needs review" for you to settle from the supplier's order history. This assumes you are not buying on the supplier site by hand at the same moment.
- New synced products stay hidden until you switch them on.
- Not built yet: email/SMS notifications, a second supplier, scheduled automatic catalogue sync (run Sync from the dashboard, or add a Supabase cron later).
- Check that reselling these account types is allowed by Paystack, your hosting, and the platforms involved before taking real payments.

## HeroSMS virtual numbers (added)

HeroSMS is the only virtual-number provider (5sim has been removed).

1. **Database**: SQL Editor → run `supabase/herosms_migration.sql`, then `supabase/herosms_cleanup.sql` (removes old 5sim data and adds the favicon setting).
2. **Function**: redeploy `supabase/functions/api/index.ts` (replace the whole file).
3. **Secret**: Edge Functions → Secrets → `HEROSMS_API_KEY` = your key from hero-sms.com.
4. **Dashboard → Virtual numbers → HeroSMS**: *Check the connection*, enter what one US dollar costs you in naira, press *Save rate and refresh HeroSMS*.
5. Switch on the apps and countries you want to sell (lists below). Prices appear after the refresh that follows each switch.
6. Buy one cheap number yourself to test, then let customers in.

How codes reach customers: one HeroSMS call lists every waiting number with its latest SMS, and that call is shared by all customers (at most one every ~1.5 s). The order page asks every 2 s, shows a countdown, plays a sound and vibrates when the code lands, and keeps listening for a second SMS for 3 minutes after the first. No code before the number expires: the number is cancelled at HeroSMS and the customer is refunded automatically. A cancel button refunds instantly while no code has arrived.

Prices: HeroSMS dollar price x your naira rate x your markup %, rounded to the nearest ₦10 step up. A number is bought with a ceiling of 15% above the listed price, so a sudden price rise cannot eat your margin.

**Favicon**: Admin → Settings → Favicon. Upload a square logo; it is saved straight away.
