import { supabaseFetch } from "./supabase.js";

export function createPublicBookingHandler(req, res, method) {
  if (method === "get") return handleGet(req, res);
  return handlePost(req, res);
}

function getSlug(req) {
  return req.query?.slug || req.params?.slug;
}

async function handleGet(req, res) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing org slug" });

  const orgRes = await supabaseFetch(`organisations?slug=eq.${encodeURIComponent(slug)}&limit=1`);
  const org = orgRes.data?.[0];
  if (!org) return res.status(404).json({ error: "Organisation not found" });

  const unitsRes = await supabaseFetch(
    `tenants?org_id=eq.${org.id}&deleted_at=is.null&or=(status.eq.available,status.eq.pending)&select=id,label,category,size,rent,row_name,status&order=category,id`
  );

  return res.json({
    org: { id: org.id, name: org.name, slug: org.slug },
    units: unitsRes.data || [],
  });
}

async function handlePost(req, res) {
  const slug = getSlug(req);
  const { unit_id, category, customer_name, customer_email, customer_phone, start_date, end_date, notes, monthly_rent } = req.body || {};

  if (!customer_name || !start_date) {
    return res.status(400).json({ error: "Name and start date are required" });
  }

  const orgRes = await supabaseFetch(`organisations?slug=eq.${encodeURIComponent(slug)}&limit=1`);
  const org = orgRes.data?.[0];
  if (!org) return res.status(404).json({ error: "Organisation not found" });

  if (unit_id) {
    const unitRes = await supabaseFetch(`tenants?id=eq.${encodeURIComponent(unit_id)}&org_id=eq.${org.id}&limit=1`);
    const unit = unitRes.data?.[0];
    if (!unit || !["available", "pending"].includes(unit.status)) {
      return res.status(409).json({ error: "Unit is no longer available" });
    }
    await supabaseFetch(`tenants?id=eq.${encodeURIComponent(unit_id)}&org_id=eq.${org.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "pending" }),
    });
  }

  const bookingRes = await supabaseFetch("bookings", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      org_id: org.id,
      unit_id: unit_id || null,
      category: category || "Storage",
      customer_name,
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      start_date,
      end_date: end_date || null,
      monthly_rent: monthly_rent || null,
      notes: notes || null,
      status: "pending",
      source: "public",
    }),
  });

  if (!bookingRes.ok) return res.status(500).json({ error: "Failed to create booking", detail: bookingRes.data });

  const booking = Array.isArray(bookingRes.data) ? bookingRes.data[0] : bookingRes.data;
  return res.json({ ok: true, booking });
}