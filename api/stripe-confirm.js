import { supabaseFetch } from "./lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { bookingId } = req.body || {};
  if (!bookingId) return res.status(400).json({ error: "bookingId required" });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });

  const bookingRes = await supabaseFetch(`bookings?id=eq.${bookingId}&limit=1`);
  const booking = bookingRes.data?.[0];
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  if (booking.deposit_paid) return res.json({ ok: true, alreadyPaid: true });

  if (booking.stripe_session_id) {
    const sr = await fetch(`https://api.stripe.com/v1/checkout/sessions/${booking.stripe_session_id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const session = await sr.json();
    if (session.payment_status === "paid") {
      await supabaseFetch(`bookings?id=eq.${bookingId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ deposit_paid: true, status: booking.status === "pending" ? "confirmed" : booking.status }),
      });
      return res.json({ ok: true, paid: true });
    }
  }

  return res.json({ ok: true, paid: false });
}