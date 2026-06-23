import { supabaseFetch } from "./supabase.js";

export function createCustomerPortalHandler(req, res, method) {
  if (method === "get") return handleGet(req, res);
  return handlePost(req, res);
}

function getSlug(req) {
  return req.query?.slug || req.params?.slug;
}

async function handleGet(req, res) {
  const slug = getSlug(req);
  if (!slug) return res.status(400).json({ error: "Missing org slug" });

  const orgRes = await supabaseFetch(`organisations?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug&limit=1`);
  const org = orgRes.data?.[0];
  if (!org) return res.status(404).json({ error: "Organisation not found" });

  return res.json({ org });
}

async function handlePost(req, res) {
  const slug = getSlug(req);
  const email = (req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Email is required" });

  const orgRes = await supabaseFetch(`organisations?slug=eq.${encodeURIComponent(slug)}&limit=1`);
  const org = orgRes.data?.[0];
  if (!org) return res.status(404).json({ error: "Organisation not found" });

  const tenantRes = await supabaseFetch(
    `tenants?org_id=eq.${org.id}&deleted_at=is.null&email=ilike.${encodeURIComponent(email)}&status=in.(occupied,arrears,new,leaving)&select=id,label,tenant,email,phone,rent,payment,status,category,move_in_date,move_out_date,size&limit=1`
  );
  const tenant = tenantRes.data?.[0];
  if (!tenant) return res.status(404).json({ error: "No active tenancy found for this email" });

  const paymentsRes = await supabaseFetch(
    `payment_records?org_id=eq.${org.id}&tenant_id=eq.${encodeURIComponent(tenant.id)}&order=period_month.desc&limit=6&select=period_month,amount,paid_at,method,notes`
  );

  return res.json({
    org: { name: org.name, slug: org.slug },
    tenant,
    payments: paymentsRes.data || [],
  });
}