import { supabaseFetch } from "./supabase.js";

export function createStripeCheckoutHandler(req, res) {
  return handleStripeCheckout(req, res);
}

export async function handleStripeCheckout(req, res) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });

  const { bookingId, amount, description, customerEmail, orgName } = req.body || {};
  if (!bookingId || !amount) return res.status(400).json({ error: "bookingId and amount required" });

  const appUrl = process.env.APP_URL || "https://cerect.vercel.app";
  const cents = Math.round(Number(amount) * 100);

  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${appUrl}/?booking=success&id=${bookingId}`,
    cancel_url: `${appUrl}/?booking=cancelled&id=${bookingId}`,
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": description || `Booking deposit — ${orgName || "Cerect"}`,
    "line_items[0][quantity]": "1",
    "metadata[booking_id]": bookingId,
  });
  if (customerEmail) params.set("customer_email", customerEmail);

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const session = await r.json();
  if (!r.ok) return res.status(400).json({ error: session.error?.message || "Stripe error" });

  await supabaseFetch(`bookings?id=eq.${bookingId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ stripe_session_id: session.id }),
  });

  return res.json({ url: session.url, sessionId: session.id });
}