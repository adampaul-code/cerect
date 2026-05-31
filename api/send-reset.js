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
      subject: "Your Cerect password has been reset",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <h2 style="color:#0F3A52">Password Reset</h2>
          <p>Your Cerect password has been reset. Use the temporary password below to log in, then change it from the Users page.</p>
          <p style="margin:24px 0;text-align:center">
            <code style="background:#f5f5f5;padding:12px 20px;border-radius:6px;font-size:18px;letter-spacing:2px">${tempPassword}</code>
          </p>
          <p><strong>Login URL:</strong> <a href="https://cerect.vercel.app">cerect.vercel.app</a></p>
          <p style="color:#999;font-size:12px">If you did not request a password reset, please contact your administrator.</p>
          <p style="color:#0F3A52;font-weight:bold">The Cerect Team</p>
        </div>
      `
    })
  });
  const data = await r.json();
  return res.status(r.ok ? 200 : 400).json(data);
}
