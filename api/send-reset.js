const RESEND_KEY = process.env.RESEND_API_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, tempPassword } = req.body;

  if (!to || !tempPassword) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({
      from: "Cerect <noreply@cerect.com>",
      to: [to],
      subject: "Your Cerect password has been reset",
      html: `
        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0B1E3D">
          <div style="margin-bottom:28px">
            <span style="font-size:22px;font-weight:700;color:#0F3A52;letter-spacing:-0.3px">cerect<span style="color:#C9A84C">.</span></span>
          </div>
          <h2 style="font-size:20px;font-weight:700;margin-bottom:8px;color:#0F3A52">Password reset</h2>
          <p style="color:#5A6E8A;margin-bottom:20px">Your Cerect password has been reset. Use the temporary password below to sign in, then change it from your account settings.</p>
          <div style="background:#F0F4F8;border-radius:10px;padding:20px;margin:24px 0;text-align:center">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#5A6E8A">Temporary password</p>
            <code style="background:#fff;padding:12px 20px;border-radius:8px;font-size:20px;letter-spacing:2px;display:inline-block">${tempPassword}</code>
          </div>
          <p style="font-size:14px"><strong>Sign in at:</strong> <a href="https://cerect.com" style="color:#1A4F72">cerect.com</a></p>
          <p style="font-size:13px;color:#9AAABB;margin-top:24px">If you did not request a password reset, please contact your administrator immediately.</p>
          <p style="font-weight:600;color:#0F3A52;margin-top:16px">The Cerect Team</p>
        </div>
      `,
    }),
  });

  const data = await r.json();
  return res.status(r.ok ? 200 : 400).json(data);
}
