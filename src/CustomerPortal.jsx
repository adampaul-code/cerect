import { useState, useEffect } from "react";

const CSS = `
:root{--navy:#1B2B4B;--gold:#C9A84C;--sub:#5A6E8A;--bg:#F4F7FA;--white:#fff;--fh:'DM Serif Display',serif;--fb:'DM Sans',sans-serif;--r:12px;--success:#27AE60}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--fb);background:var(--bg);color:var(--navy)}
.portal{min-height:100vh;padding:32px 20px}
.portal-inner{max-width:640px;margin:0 auto}
.portal-logo{font-family:var(--fh);font-size:28px;font-weight:700;color:var(--navy);margin-bottom:4px}
.portal-logo span{color:var(--gold)}
.card{background:var(--white);border-radius:var(--r);padding:24px;box-shadow:0 2px 12px rgba(27,43,75,.08);margin-bottom:20px}
.card h2{font-family:var(--fh);font-size:20px;margin-bottom:16px}
.fgi label{display:block;font-size:12px;font-weight:600;color:var(--sub);margin-bottom:5px}
.fgi input{width:100%;font-family:var(--fb);font-size:14px;padding:10px 12px;border:1.5px solid #E4EAF2;border-radius:8px;outline:none;margin-bottom:14px}
.fgi input:focus{border-color:var(--gold)}
.btn{font-family:var(--fb);font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;border:none;cursor:pointer;width:100%}
.btn-primary{background:var(--navy);color:#fff}
.btn-primary:disabled{opacity:.5}
.stat{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #F0F4FA;font-size:14px}
.stat:last-child{border-bottom:none}
.stat-l{color:var(--sub)}
.stat-v{font-weight:600}
.pill{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
.pill-occ{background:#E8F5E9;color:#2E7D32}
.pill-arr{background:#FFF3E0;color:#E65100}
.pill-new{background:#FFF8E1;color:#F57F17}
`;

const STATUS_LABEL = { occupied: "Active", arrears: "In arrears", new: "New customer", leaving: "Leaving" };
const STATUS_CLASS = { occupied: "pill-occ", arrears: "pill-arr", new: "pill-new", leaving: "pill-arr" };

export default function CustomerPortal({ orgSlug }) {
  const [org, setOrg] = useState(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [account, setAccount] = useState(null);

  useEffect(() => {
    fetch(`/api/customer-portal/${orgSlug}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setOrg(d.org);
      })
      .catch(() => setError("Failed to load portal"))
      .finally(() => setLoading(false));
  }, [orgSlug]);

  async function handleLookup(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch(`/api/customer-portal/${orgSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Lookup failed"); setAccount(null); return; }
      setAccount(d);
    } catch {
      setError("Could not look up your account — please try again");
    }
    setSubmitting(false);
  }

  if (loading) return <div className="portal"><style>{CSS}</style><div className="portal-inner"><p>Loading…</p></div></div>;
  if (error && !org) return (
    <div className="portal"><style>{CSS}</style>
      <div className="portal-inner">
        <div className="portal-logo">cerect<span>.</span></div>
        <div className="card" style={{ marginTop: 24 }}>
          <h2>Page not found</h2>
          <p style={{ color: "var(--sub)", fontSize: 14, marginBottom: 16 }}>
            {error === "Organisation not found"
              ? "This customer portal link hasn't been activated yet. If you own this business, log in to Cerect, go to Growth & Online, and click Create links."
              : error}
          </p>
          <a href="/" className="btn btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>Go to Cerect</a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="portal">
      <style>{CSS}</style>
      <div className="portal-inner">
        <div className="portal-logo">cerect<span>.</span></div>
        <p style={{ color: "var(--sub)", fontSize: 14, marginBottom: 28 }}>Customer portal — {org?.name}</p>

        {!account ? (
          <form className="card" onSubmit={handleLookup}>
            <h2>View your account</h2>
            <p style={{ fontSize: 13, color: "var(--sub)", marginBottom: 16 }}>
              Enter the email address on your tenancy agreement to view your unit, rent, and payment history.
            </p>
            <div className="fgi">
              <label>Email address</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            {error && <p style={{ color: "#C0392B", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Looking up…" : "View my account"}
            </button>
          </form>
        ) : (
          <>
            <div className="card">
              <h2>Hello, {account.tenant.tenant}</h2>
              <div className="stat"><span className="stat-l">Unit</span><span className="stat-v">{account.tenant.label || account.tenant.id}</span></div>
              <div className="stat"><span className="stat-l">Type</span><span className="stat-v">{account.tenant.category}</span></div>
              <div className="stat"><span className="stat-l">Status</span>
                <span className={`pill ${STATUS_CLASS[account.tenant.status] || "pill-occ"}`}>
                  {STATUS_LABEL[account.tenant.status] || account.tenant.status}
                </span>
              </div>
              <div className="stat"><span className="stat-l">Monthly rent</span><span className="stat-v">£{Number(account.tenant.rent || 0).toLocaleString()}</span></div>
              <div className="stat"><span className="stat-l">Payment method</span><span className="stat-v">{account.tenant.payment || "—"}</span></div>
              {account.tenant.move_in_date && (
                <div className="stat"><span className="stat-l">Move-in date</span><span className="stat-v">{new Date(account.tenant.move_in_date).toLocaleDateString("en-GB")}</span></div>
              )}
            </div>

            <div className="card">
              <h2>Recent payments</h2>
              {account.payments.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--sub)" }}>No payment records on file yet.</p>
              ) : (
                account.payments.map(p => (
                  <div key={p.period_month} className="stat">
                    <span className="stat-l">{p.period_month}</span>
                    <span className="stat-v" style={{ color: "var(--success)" }}>
                      ✓ £{Number(p.amount || 0).toLocaleString()}
                      {p.paid_at && <span style={{ fontWeight: 400, color: "var(--sub)", fontSize: 11, marginLeft: 6 }}>
                        {new Date(p.paid_at).toLocaleDateString("en-GB")}
                      </span>}
                    </span>
                  </div>
                ))
              )}
            </div>

            <button type="button" className="btn btn-primary" style={{ background: "#fff", color: "var(--navy)", border: "1.5px solid #E4EAF2" }}
              onClick={() => { setAccount(null); setError(""); }}>
              ← Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}