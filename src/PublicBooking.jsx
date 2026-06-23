import { useState, useEffect } from "react";

const CSS = `
:root{--navy:#1B2B4B;--gold:#C9A84C;--sub:#5A6E8A;--bg:#F4F7FA;--white:#fff;--fh:'DM Serif Display',serif;--fb:'DM Sans',sans-serif;--r:12px}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--fb);background:var(--bg);color:var(--navy)}
.pub{min-height:100vh;padding:32px 20px}
.pub-inner{max-width:900px;margin:0 auto}
.pub-logo{font-family:var(--fh);font-size:28px;font-weight:700;color:var(--navy);margin-bottom:4px}
.pub-logo span{color:var(--gold)}
.pub-sub{color:var(--sub);font-size:14px;margin-bottom:28px}
.card{background:var(--white);border-radius:var(--r);padding:24px;box-shadow:0 2px 12px rgba(27,43,75,.08);margin-bottom:20px}
.card h2{font-family:var(--fh);font-size:20px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.unit-card{border:2px solid #E4EAF2;border-radius:10px;padding:14px;cursor:pointer;transition:.15s}
.unit-card:hover,.unit-card.sel{border-color:var(--gold);background:#FFFBF0}
.unit-id{font-family:var(--fh);font-weight:700;font-size:16px}
.unit-meta{font-size:12px;color:var(--sub);margin-top:4px}
.fg{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:600px){.fg{grid-template-columns:1fr}}
.fgi label{display:block;font-size:12px;font-weight:600;color:var(--sub);margin-bottom:5px}
.fgi input,.fgi select,.fgi textarea{width:100%;font-family:var(--fb);font-size:14px;padding:10px 12px;border:1.5px solid #E4EAF2;border-radius:8px;outline:none}
.fgi input:focus,.fgi select:focus{border-color:var(--gold)}
.fgi.full{grid-column:1/-1}
.btn{font-family:var(--fb);font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;border:none;cursor:pointer}
.btn-primary{background:var(--navy);color:#fff}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.success{text-align:center;padding:60px 20px}
.success h2{font-family:var(--fh);font-size:24px;margin-bottom:12px}
.cat-tabs{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
.cat-tab{padding:8px 16px;border-radius:20px;border:1.5px solid #E4EAF2;background:#fff;font-size:13px;font-weight:600;cursor:pointer}
.cat-tab.active{border-color:var(--gold);background:#FFFBF0;color:var(--navy)}
`;

const CATEGORIES = ["Storage", "Residential", "Commercial"];

export default function PublicBooking({ orgSlug }) {
  const [org, setOrg] = useState(null);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cat, setCat] = useState("Storage");
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    notes: "",
  });

  useEffect(() => {
    fetch(`/api/public-booking/${orgSlug}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setOrg(d.org);
        setUnits(d.units || []);
      })
      .catch(() => setError("Failed to load booking page"))
      .finally(() => setLoading(false));
  }, [orgSlug]);

  const filtered = units.filter(u => u.category === cat);
  const u = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.customer_name || !form.start_date) return;
    setSubmitting(true);
    try {
      const unit = selectedUnit ? units.find(x => x.id === selectedUnit) : null;
      const r = await fetch(`/api/public-booking/${orgSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          unit_id: selectedUnit,
          category: cat,
          monthly_rent: unit?.rent || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Booking failed"); return; }
      setDone(true);
    } catch {
      setError("Booking failed — please try again");
    }
    setSubmitting(false);
  }

  if (loading) return <div className="pub"><style>{CSS}</style><div className="pub-inner"><p>Loading…</p></div></div>;
  if (error && !org) return <div className="pub"><style>{CSS}</style><div className="pub-inner"><p>{error}</p></div></div>;

  if (done) return (
    <div className="pub"><style>{CSS}</style>
      <div className="pub-inner success">
        <div className="pub-logo">cerect<span>.</span></div>
        <h2>Booking request received</h2>
        <p style={{ color: "var(--sub)", marginBottom: 20 }}>
          Thank you, {form.customer_name}. {org?.name} will confirm your booking shortly.
        </p>
        <a href="/" className="btn btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>Back to Cerect</a>
      </div>
    </div>
  );

  return (
    <div className="pub">
      <style>{CSS}</style>
      <div className="pub-inner">
        <div className="pub-logo">cerect<span>.</span></div>
        <div className="pub-sub">Book with {org?.name}</div>

        <div className="card">
          <h2>Choose property type</h2>
          <div className="cat-tabs">
            {CATEGORIES.map(c => (
              <button key={c} type="button" className={`cat-tab ${cat === c ? "active" : ""}`} onClick={() => { setCat(c); setSelectedUnit(null); }}>
                {c}
              </button>
            ))}
          </div>

          {filtered.length > 0 ? (
            <>
              <p style={{ fontSize: 13, color: "var(--sub)", marginBottom: 12 }}>Select an available unit (optional)</p>
              <div className="grid">
                {filtered.map(unit => (
                  <div key={unit.id} className={`unit-card ${selectedUnit === unit.id ? "sel" : ""}`}
                    onClick={() => setSelectedUnit(selectedUnit === unit.id ? null : unit.id)}>
                    <div className="unit-id">{unit.label || unit.id}</div>
                    <div className="unit-meta">
                      {unit.size && `${unit.size} · `}
                      {unit.rent ? `£${unit.rent}/mo` : "Price on request"}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: "var(--sub)" }}>No units currently listed — you can still submit a general enquiry below.</p>
          )}
        </div>

        <form className="card" onSubmit={handleSubmit}>
          <h2>Your details</h2>
          <div className="fg">
            <div className="fgi"><label>Full name *</label><input required value={form.customer_name} onChange={u("customer_name")} /></div>
            <div className="fgi"><label>Email</label><input type="email" value={form.customer_email} onChange={u("customer_email")} /></div>
            <div className="fgi"><label>Phone</label><input value={form.customer_phone} onChange={u("customer_phone")} /></div>
            <div className="fgi"><label>Preferred start date *</label><input type="date" required value={form.start_date} onChange={u("start_date")} /></div>
            <div className="fgi"><label>End date (if applicable)</label><input type="date" value={form.end_date} onChange={u("end_date")} /></div>
            <div className="fgi full"><label>Notes</label><textarea rows={3} value={form.notes} onChange={u("notes")} placeholder="Size requirements, access needs, etc." /></div>
          </div>
          {error && <p style={{ color: "#C0392B", fontSize: 13, marginTop: 12 }}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ marginTop: 20 }} disabled={submitting}>
            {submitting ? "Submitting…" : "Request booking"}
          </button>
        </form>
      </div>
    </div>
  );
}