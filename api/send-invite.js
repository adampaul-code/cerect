export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { to, tempPassword } = req.body;
  if (!to || !tempPassword) return res.status(400).json({ error: "Missing required fields" });
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(500).json({ error: "Missing RESEND_API_KEY" });
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({
      from: "Cerect <noreply@cerect.com>",
      to: [to],
      subject: "You've been invited to Cerect",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <h2 style="color:#0F3A52">You've been invited to Cerect</h2>
          <p>You have been given access to the Cerect Property Management Platform.</p>
          <p><strong>Login URL:</strong> <a href="https://cerect.vercel.app">cerect.vercel.app</a></p>
          <p><strong>Email:</strong> ${to}</p>
          <p><strong>Temporary Password:</strong> <code style="background:#f5f5f5;padding:4px 8px;border-radius:4px;font-size:16px">${tempPassword}</code></p>
          <p>On first login you will be asked to set up two-factor authentication (MFA) using an authenticator app such as Google Authenticator or Authy.</p>
          <p style="color:#999;font-size:12px">Please change your password after first login. If you did not expect this invitation, please ignore this email.</p>
          <p style="color:#0F3A52;font-weight:bold">The Cerect Team</p>
        </div>
      `
    })
  });
  const data = await r.json();
  return res.status(r.ok ? 200 : 400).json(data);
}
