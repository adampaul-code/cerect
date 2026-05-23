const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ADMIN_H = {
  "Content-Type": "application/json",
  "apikey": SERVICE_KEY,
  "Authorization": `Bearer ${SERVICE_KEY}`,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, ...params } = req.body;

  try {
    switch (action) {

      case "listUsers": {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100`, { headers: ADMIN_H });
        const d = await r.json();
        const users = d.users || [];
        const withFactors = await Promise.all(users.map(async u => {
          try {
            const fr = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}/factors`, { headers: ADMIN_H });
            if (fr.ok) {
              const factors = await fr.json();
              return { ...u, factors: Array.isArray(factors) ? factors : [] };
            }
          } catch {}
          return u;
        }));
        return res.status(200).json({ users: withFactors });
      }

      case "createUser": {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
          method: "POST",
          headers: ADMIN_H,
          body: JSON.stringify({ email: params.email, password: params.password, email_confirm: true }),
        });
        const d = await r.json();
        return res.status(r.ok ? 200 : 400).json(d);
      }

      case "deleteUser": {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${params.userId}`, {
          method: "DELETE",
          headers: ADMIN_H,
        });
        return res.status(r.ok ? 200 : 400).json({ ok: r.ok });
      }

      case "resetPassword": {
        const lr = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100`, { headers: ADMIN_H });
        const ld = await lr.json();
        const user = (ld.users || []).find(u => u.email === params.email);
        if (!user) return res.status(404).json({ error: "No account found with that email address" });
        const tempPass = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase() + "!1";
        const ur = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
          method: "PUT",
          headers: ADMIN_H,
          body: JSON.stringify({ password: tempPass }),
        });
        if (!ur.ok) return res.status(400).json({ error: "Could not reset password" });
        return res.status(200).json({ tempPass });
      }

      default:
        return res.status(400).json({ error: "Unknown action" });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
