import { supabaseFetch, serviceHeaders } from "./lib/supabase.js";

const SUPABASE_URL = process.env.SUPABASE_URL;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { orgId, slug, accessToken } = req.body || {};
  if (!orgId || !slug || !accessToken) {
    return res.status(400).json({ error: "Missing orgId, slug, or accessToken" });
  }

  const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!clean) return res.status(400).json({ error: "Invalid link name" });

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { ...serviceHeaders(), Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) return res.status(401).json({ error: "Not authenticated" });
  const user = await userRes.json();

  const memberRes = await supabaseFetch(`org_users?org_id=eq.${orgId}&user_id=eq.${user.id}&limit=1`);
  if (!memberRes.data?.[0]) return res.status(403).json({ error: "Not authorised for this organisation" });

  const takenRes = await supabaseFetch(`organisations?slug=eq.${encodeURIComponent(clean)}&id=neq.${orgId}&limit=1`);
  if (takenRes.data?.[0]) {
    return res.status(409).json({ error: "This link name is already taken — try another" });
  }

  const patchRes = await supabaseFetch(`organisations?id=eq.${orgId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ slug: clean }),
  });

  if (!patchRes.ok) {
    return res.status(500).json({ error: "Could not save link name", detail: patchRes.data });
  }

  const org = Array.isArray(patchRes.data) ? patchRes.data[0] : { id: orgId, slug: clean };
  return res.json({ ok: true, org });
}