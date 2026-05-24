// Cerect v0.4 — Storage Management Platform
// https://cerect.com

import { useState, useEffect, useCallback, useRef } from "react";

const SUPABASE_URL = "https://lbealsgloqoepazfrgbj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiZWFsc2dsb3FvZXBhemZyZ2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MzE4OTEsImV4cCI6MjA5NTEwNzg5MX0.r8bWBOmqQy9VDcyk6mCxxfK1bORFYBs1lHTVMRvETEY";
const BASE_H = { "Content-Type": "application/json", apikey: SUPABASE_KEY };

// ─── Auth helpers ─────────────────────────────────────────────────────────────
async function signIn(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { ...BASE_H },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.msg || "Login failed");
  return data;
}

async function signOut(token) {
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: "POST",
    headers: { ...BASE_H, Authorization: `Bearer ${token}` },
  });
}

async function refreshSession(refreshToken) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { ...BASE_H },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!r.ok) return null;
  return r.json();
}

async function mfaEnroll(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/factors`, {
    method: "POST",
    headers: { ...BASE_H, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ friendly_name: "Cerect", factor_type: "totp" }),
  });
  return r.json();
}

async function mfaChallenge(factorId, token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}/challenge`, {
    method: "POST",
    headers: { ...BASE_H, Authorization: `Bearer ${token}` },
  });
  return r.json();
}

async function mfaVerify(factorId, challengeId, code, token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}/verify`, {
    method: "POST",
    headers: { ...BASE_H, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ challenge_id: challengeId, code }),
  });
  return r.json();
}

async function mfaListFactors(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { ...BASE_H, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  const d = await r.json();
  return d.factors || [];
}

// ─── Org helpers ──────────────────────────────────────────────────────────────
function authH(token) {
  return { ...BASE_H, Authorization: `Bearer ${token}` };
}

async function getOrgForUser(userId, token) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/org_users?user_id=eq.${userId}&limit=1`,
    { headers: authH(token) }
  );
  if (!r.ok) return null;
  const rows = await r.json();
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

async function createOrg(name, userId, token) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/organisations`, {
    method: "POST",
    headers: { ...authH(token), Prefer: "return=representation" },
    body: JSON.stringify({ name, slug, plan: "trial" }),
  });
  const text = await r.text();
  console.log("createOrg response:", r.status, text);
  if (!r.ok) throw new Error(`Database error (${r.status}): ${text}`);
  let org = null;
  try { const arr = JSON.parse(text); org = Array.isArray(arr) ? arr[0] : arr; } catch {}
  if (!org?.id) throw new Error("Organisation created but ID not returned");
  const r2 = await fetch(`${SUPABASE_URL}/rest/v1/org_users`, {
    method: "POST",
    headers: { ...authH(token), Prefer: "return=minimal" },
    body: JSON.stringify({ org_id: org.id, user_id: userId, role: "admin" }),
  });
  console.log("org_users response:", r2.status);
  return org;
}

async function getOrgDetails(orgId, token) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/organisations?id=eq.${orgId}&limit=1`,
    { headers: authH(token) }
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] || null;
}

// ─── Data constants ───────────────────────────────────────────────────────────
const SL = { occupied: "Occupied", arrears: "In Arrears", leaving: "Leaving", new: "New Customer", pending: "Pending", available: "Available" };
const STATUSES = ["occupied", "arrears", "leaving", "new", "pending", "available"];
const PAYMENTS = ["Monthly DD", "Stripe", "SO", "Pays Manually", "DD", "—", "Other"];
const UC = { occupied: "uc-occ", arrears: "uc-arr", leaving: "uc-lea", new: "uc-new", pending: "uc-pen", available: "uc-avl" };
const DC = { occupied: "d-occ", arrears: "d-arr", leaving: "d-lea", new: "d-new", pending: "d-pen", available: "d-avl" };

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function dbGet(orgId, token) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/tenants?org_id=eq.${orgId}&order=category,id&archived=neq.true&deleted_at=is.null`,
    { headers: authH(token) }
  );
  if (r.status === 401) throw new Error("SESSION_EXPIRED");
  return r.json();
}

async function dbUpsert(row, token) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tenants`, {
    method: "POST",
    headers: { ...authH(token), Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  return r.json();
}

async function dbDelete(id, orgId, token) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(id)}&org_id=eq.${orgId}`,
    { method: "DELETE", headers: authH(token) }
  );
}

async function areasGet(orgId, token) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/areas?org_id=eq.${orgId}&order=sort_order,name`,
    { headers: authH(token) }
  );
  return r.json();
}

async function areasUpsert(name, category, sortOrder, orgId, token) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/areas`, {
    method: "POST",
    headers: { ...authH(token), Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ name, category, sort_order: sortOrder, org_id: orgId }),
  });
  return r.json();
}

async function areasDelete(name, orgId, token) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/areas?name=eq.${encodeURIComponent(name)}&org_id=eq.${orgId}`,
    { method: "DELETE", headers: authH(token) }
  );
}

async function areasUpdateOrder(names, orgId, token) {
  for (let i = 0; i < names.length; i++) {
    await fetch(
      `${SUPABASE_URL}/rest/v1/areas?name=eq.${encodeURIComponent(names[i])}&org_id=eq.${orgId}`,
      {
        method: "PATCH",
        headers: { ...authH(token), Prefer: "return=minimal" },
        body: JSON.stringify({ sort_order: i }),
      }
    );
  }
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --navy: #0F3A52;
  --navy2: #1A4F72;
  --gold: #C9A84C;
  --gold2: #E8C472;
  --white: #fff;
  --mist: #F0F4F8;
  --mist2: #E4ECF3;
  --text: #0B1E3D;
  --sub: #5A6E8A;
  --border: rgba(11,30,61,.10);
  --success: #1A7F5A;
  --danger: #C0392B;
  --warning: #B7860B;
  --fh: 'Syne', sans-serif;
  --fb: 'DM Sans', sans-serif;
  --r: 10px;
  --r2: 16px;
  --sh: 0 2px 12px rgba(11,30,61,.08);
  --shl: 0 8px 40px rgba(11,30,61,.14);
}

body {
  font-family: var(--fb);
  background: var(--mist);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

/* ── Login ───────────────────────────────────────────────────────────────── */
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
}

@media (max-width: 768px) {
  .login-page { grid-template-columns: 1fr; }
  .login-brand { display: none; }
}

.login-brand {
  background: var(--navy);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 60px;
  position: relative;
  overflow: hidden;
}

.login-brand::before {
  content: '';
  position: absolute;
  top: -120px; right: -120px;
  width: 500px; height: 500px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(201,168,76,.12) 0%, transparent 70%);
}

.login-brand::after {
  content: '';
  position: absolute;
  bottom: -80px; left: -80px;
  width: 360px; height: 360px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(201,168,76,.08) 0%, transparent 70%);
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 48px;
  position: relative;
  z-index: 1;
}

.brand-wordmark {
  font-family: var(--fh);
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.5px;
}

.brand-wordmark span {
  color: var(--gold);
}

.brand-tagline {
  font-family: var(--fh);
  font-size: 42px;
  font-weight: 700;
  color: #fff;
  line-height: 1.15;
  margin-bottom: 24px;
  position: relative;
  z-index: 1;
}

.brand-tagline em {
  font-style: normal;
  color: var(--gold);
}

.brand-sub {
  font-size: 16px;
  color: rgba(255,255,255,.6);
  line-height: 1.6;
  max-width: 340px;
  position: relative;
  z-index: 1;
}

.brand-dots {
  position: absolute;
  bottom: 48px;
  left: 60px;
  display: flex;
  gap: 8px;
  z-index: 1;
}

.brand-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: rgba(255,255,255,.25);
}

.brand-dot.active { background: var(--gold); }

.login-form-wrap {
  background: #fff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 48px 40px;
}

.login-box {
  width: 100%;
  max-width: 380px;
}

.login-heading {
  font-family: var(--fh);
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 6px;
}

.login-hint {
  font-size: 14px;
  color: var(--sub);
  margin-bottom: 32px;
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.login-field label {
  font-size: 12px;
  font-weight: 500;
  color: var(--sub);
  text-transform: uppercase;
  letter-spacing: .6px;
}

.login-field input {
  font-family: var(--fb);
  font-size: 15px;
  padding: 11px 14px;
  border: 1.5px solid var(--mist2);
  border-radius: var(--r);
  outline: none;
  transition: border-color .15s;
  color: var(--text);
  background: #fff;
}

.login-field input:focus { border-color: var(--navy2); }

.login-btn {
  width: 100%;
  background: var(--navy);
  color: #fff;
  font-family: var(--fb);
  font-size: 15px;
  font-weight: 500;
  padding: 12px;
  border: none;
  border-radius: var(--r);
  cursor: pointer;
  margin-top: 8px;
  transition: background .15s, transform .1s;
  letter-spacing: .1px;
}

.login-btn:hover { background: var(--navy2); }
.login-btn:active { transform: scale(.99); }
.login-btn:disabled { opacity: .55; cursor: not-allowed; }

.login-err {
  background: #FFF0EE;
  border: 1px solid #FFCDD2;
  border-radius: var(--r);
  padding: 10px 14px;
  font-size: 13px;
  color: var(--danger);
  margin-bottom: 14px;
}

.login-ok {
  background: #EDF7F2;
  border: 1px solid #A8DEC2;
  border-radius: var(--r);
  padding: 10px 14px;
  font-size: 13px;
  color: var(--success);
  margin-bottom: 14px;
}

.login-mfa-box {
  background: var(--mist);
  border-radius: var(--r);
  padding: 16px;
  margin-bottom: 16px;
  text-align: center;
}

.login-mfa-title {
  font-family: var(--fh);
  font-size: 15px;
  font-weight: 600;
  color: var(--navy);
  margin-bottom: 4px;
}

.login-mfa-sub {
  font-size: 13px;
  color: var(--sub);
}

.login-link {
  background: none;
  border: none;
  color: var(--navy2);
  font-family: var(--fb);
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  margin-top: 16px;
  display: block;
  text-align: center;
}

.mfa-digits {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin: 16px 0;
}

.mfa-digit {
  width: 44px; height: 52px;
  border: 1.5px solid var(--mist2);
  border-radius: var(--r);
  font-size: 22px;
  font-weight: 600;
  text-align: center;
  font-family: var(--fh);
  color: var(--navy);
  outline: none;
  transition: border-color .15s;
}

.mfa-digit:focus { border-color: var(--navy2); }

.login-footer {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--mist2);
  text-align: center;
  font-size: 12px;
  color: var(--sub);
}

/* ── App shell ───────────────────────────────────────────────────────────── */
.app { display: flex; min-height: 100vh; }

.sidebar {
  width: 232px;
  min-height: 100vh;
  background: var(--navy);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0; left: 0;
  z-index: 100;
  transition: transform .25s ease;
}

@media (max-width: 900px) {
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
  .main { margin-left: 0 !important; }
}

.sidebar-logo {
  padding: 20px 18px 16px;
  border-bottom: 1px solid rgba(255,255,255,.1);
}

.sidebar-wordmark {
  font-family: var(--fh);
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.3px;
}

.sidebar-wordmark span { color: var(--gold); }

.sidebar-tagline {
  font-size: 11px;
  color: rgba(255,255,255,.4);
  margin-top: 2px;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 0;
  overflow-y: auto;
}

.nav-section {
  padding: 12px 18px 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .8px;
  color: rgba(255,255,255,.3);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 18px;
  font-size: 14px;
  color: rgba(255,255,255,.65);
  cursor: pointer;
  border-radius: 0;
  transition: background .12s, color .12s;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  font-family: var(--fb);
}

.nav-item:hover { background: rgba(255,255,255,.07); color: #fff; }

.nav-item.active {
  background: rgba(255,255,255,.12);
  color: #fff;
  font-weight: 500;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  width: 3px;
  height: 36px;
  background: var(--gold);
  border-radius: 0 2px 2px 0;
}

.nav-item { position: relative; }

.nav-icon {
  width: 18px; height: 18px;
  opacity: .7;
  flex-shrink: 0;
}

.nav-item.active .nav-icon,
.nav-item:hover .nav-icon { opacity: 1; }

.sidebar-bottom {
  padding: 14px 18px;
  border-top: 1px solid rgba(255,255,255,.1);
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 30px; height: 30px;
  border-radius: 50%;
  background: rgba(255,255,255,.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}

.user-email {
  font-size: 12px;
  color: rgba(255,255,255,.55);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.signout-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,.4);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: color .12s;
}

.signout-btn:hover { color: rgba(255,255,255,.85); }

.main {
  margin-left: 232px;
  flex: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.topbar {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 28px;
  gap: 16px;
  position: sticky;
  top: 0;
  z-index: 50;
}

.topbar-title {
  font-family: var(--fh);
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
  flex: 1;
}

.topbar-org {
  font-size: 13px;
  color: var(--sub);
  background: var(--mist);
  padding: 4px 10px;
  border-radius: 99px;
}

.hamburger {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--text);
}

@media (max-width: 900px) { .hamburger { display: flex; } }

.page { padding: 28px; flex: 1; }

/* ── Cards ───────────────────────────────────────────────────────────────── */
.card {
  background: #fff;
  border-radius: var(--r2);
  border: 1px solid var(--border);
  padding: 20px 24px;
}

.card-title {
  font-family: var(--fh);
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}

.card-sub {
  font-size: 13px;
  color: var(--sub);
  margin-bottom: 16px;
}

/* ── KPI grid ────────────────────────────────────────────────────────────── */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 24px;
}

.kpi-card {
  background: #fff;
  border-radius: var(--r2);
  border: 1px solid var(--border);
  padding: 18px 22px;
}

.kpi-label {
  font-size: 12px;
  color: var(--sub);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: .5px;
  margin-bottom: 6px;
}

.kpi-value {
  font-family: var(--fh);
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
  margin-bottom: 4px;
}

.kpi-meta {
  font-size: 12px;
  color: var(--sub);
}

/* ── Pill / badge ─────────────────────────────────────────────────────────── */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 500;
}

.pill-occupied { background: #E6F4EE; color: #1A7F5A; }
.pill-arrears  { background: #FEF3EE; color: #C0392B; }
.pill-leaving  { background: #FFF8E6; color: #B7860B; }
.pill-new      { background: #E8F0FE; color: #1A56C4; }
.pill-pending  { background: #F3EDF7; color: #6B3FA0; }
.pill-available{ background: var(--mist); color: var(--sub); }

/* ── Coming soon placeholder ─────────────────────────────────────────────── */
.coming-soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  gap: 12px;
  color: var(--sub);
}

.coming-soon-icon {
  width: 48px; height: 48px;
  opacity: .25;
}

.coming-soon-title {
  font-family: var(--fh);
  font-size: 18px;
  font-weight: 600;
  color: var(--sub);
}

.coming-soon-sub {
  font-size: 14px;
  color: var(--sub);
  opacity: .7;
}

/* ── Onboarding ──────────────────────────────────────────────────────────── */
.onboard-page {
  min-height: 100vh;
  background: var(--mist);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.onboard-card {
  background: #fff;
  border-radius: 20px;
  border: 1px solid var(--border);
  padding: 40px;
  width: 100%;
  max-width: 520px;
  box-shadow: var(--shl);
}

.onboard-logo {
  font-family: var(--fh);
  font-size: 20px;
  font-weight: 700;
  color: var(--navy);
  margin-bottom: 32px;
  letter-spacing: -0.3px;
}

.onboard-logo span { color: var(--gold); }

.onboard-steps {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 32px;
}

.onboard-step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.onboard-step-circle {
  width: 28px; height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  transition: all .2s;
}

.onboard-step-circle.done {
  background: var(--success);
  color: #fff;
}

.onboard-step-circle.active {
  background: var(--navy);
  color: #fff;
}

.onboard-step-circle.pending {
  background: var(--mist);
  color: var(--sub);
  border: 1.5px solid var(--mist2);
}

.onboard-step-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--sub);
  white-space: nowrap;
}

.onboard-step-label.active { color: var(--navy); }
.onboard-step-label.done { color: var(--success); }

.onboard-step-line {
  flex: 1;
  height: 1px;
  background: var(--mist2);
  margin: 0 8px;
}

.onboard-heading {
  font-family: var(--fh);
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 6px;
}

.onboard-sub {
  font-size: 14px;
  color: var(--sub);
  line-height: 1.6;
  margin-bottom: 24px;
}

.onboard-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.onboard-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--sub);
  text-transform: uppercase;
  letter-spacing: .6px;
}

.onboard-input {
  font-family: var(--fb);
  font-size: 15px;
  padding: 11px 14px;
  border: 1.5px solid var(--mist2);
  border-radius: var(--r);
  outline: none;
  transition: border-color .15s;
  color: var(--text);
  background: #fff;
  width: 100%;
}

.onboard-input:focus { border-color: var(--navy2); }

.onboard-hint {
  font-size: 12px;
  color: var(--sub);
}

.onboard-btn {
  width: 100%;
  background: var(--navy);
  color: #fff;
  font-family: var(--fb);
  font-size: 15px;
  font-weight: 500;
  padding: 12px;
  border: none;
  border-radius: var(--r);
  cursor: pointer;
  margin-top: 8px;
  transition: background .15s;
}

.onboard-btn:hover { background: var(--navy2); }
.onboard-btn:disabled { opacity: .5; cursor: not-allowed; }

.onboard-err {
  background: #FFF0EE;
  border: 1px solid #FFCDD2;
  border-radius: var(--r);
  padding: 10px 14px;
  font-size: 13px;
  color: var(--danger);
  margin-bottom: 14px;
}

.onboard-success {
  text-align: center;
  padding: 16px 0;
}

.onboard-success-icon {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: #EDF7F2;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  font-size: 24px;
}

.category-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}

.category-card {
  border: 1.5px solid var(--mist2);
  border-radius: var(--r);
  padding: 14px;
  cursor: pointer;
  transition: all .15s;
  text-align: center;
}

.category-card:hover { border-color: var(--navy2); background: var(--mist); }
.category-card.selected { border-color: var(--navy); background: #EEF4F8; }

.category-card-icon { font-size: 22px; margin-bottom: 6px; }
.category-card-label { font-size: 13px; font-weight: 500; color: var(--text); }
.category-card-sub { font-size: 11px; color: var(--sub); margin-top: 2px; }



.onboard-step-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 32px;
}

.onboard-step-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--mist2);
}

.onboard-step-dot.done { background: var(--success); }
.onboard-step-dot.active { background: var(--navy); width: 24px; border-radius: 4px; }

.onboard-heading {
  font-family: var(--fh);
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 8px;
}

.onboard-sub {
  font-size: 15px;
  color: var(--sub);
  line-height: 1.6;
  margin-bottom: 28px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 18px;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--sub);
  text-transform: uppercase;
  letter-spacing: .6px;
}

.form-input {
  font-family: var(--fb);
  font-size: 15px;
  padding: 11px 14px;
  border: 1.5px solid var(--mist2);
  border-radius: var(--r);
  outline: none;
  transition: border-color .15s;
  color: var(--text);
  background: #fff;
}

.form-input:focus { border-color: var(--navy2); }

.form-hint {
  font-size: 12px;
  color: var(--sub);
  margin-top: -10px;
}

.btn-primary {
  background: var(--navy);
  color: #fff;
  font-family: var(--fb);
  font-size: 15px;
  font-weight: 500;
  padding: 11px 22px;
  border: none;
  border-radius: var(--r);
  cursor: pointer;
  transition: background .15s;
}

.btn-primary:hover { background: var(--navy2); }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }

.btn-secondary {
  background: var(--mist);
  color: var(--text);
  font-family: var(--fb);
  font-size: 15px;
  font-weight: 500;
  padding: 11px 22px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  cursor: pointer;
  transition: background .15s;
}

.btn-secondary:hover { background: var(--mist2); }

/* ── Site plan ───────────────────────────────────────────────────────────── */
.sp-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.sp-filters { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sp-btn { display: inline-flex; align-items: center; gap: 6px; font-family: var(--fb); font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 7px; border: 1.5px solid var(--border); background: #fff; color: var(--text); cursor: pointer; transition: all .15s; }
.sp-btn:hover { border-color: var(--navy2); color: var(--navy); }
.sp-btn.active { background: var(--navy); color: #fff; border-color: var(--navy); }
.sp-btn-primary { background: var(--gold); color: var(--navy); border-color: var(--gold); font-weight: 600; }
.sp-btn-primary:hover { background: var(--gold2); border-color: var(--gold2); }
.sp-btn-navy { background: var(--navy); color: #fff; border-color: var(--navy); }
.sp-btn-navy:hover { background: var(--navy2); }
.sp-btn-danger { background: #FFF0EE; color: var(--danger); border-color: #FFCDD2; }
.sp-btn-danger:hover { background: #FFE0DC; }

.sp-area { margin-bottom: 24px; }
.sp-area-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid var(--gold); }
.sp-area-title { font-family: var(--fh); font-size: 16px; font-weight: 700; color: var(--navy); }
.sp-area-count { font-size: 11px; color: var(--sub); font-weight: 500; background: var(--mist); border: 1px solid var(--mist2); border-radius: 20px; padding: 2px 8px; margin-left: 8px; }
.sp-area-actions { display: flex; align-items: center; gap: 6px; }
.sp-drag-handle { cursor: grab; color: var(--sub); font-size: 16px; padding: 0 4px; opacity: 0.5; }
.sp-drag-handle:hover { opacity: 1; }

.ug { display: flex; flex-wrap: wrap; gap: 7px; }
.uc { border-radius: 8px; padding: 9px 12px; min-width: 105px; cursor: pointer; border: 2px solid transparent; transition: all .17s; position: relative; }
.uc:hover { transform: translateY(-2px); box-shadow: var(--sh); }
.uc.sel { outline: 2.5px solid var(--gold); outline-offset: 2px; }
.uc-occ { background: #EBF5F0; border-color: #BDE5D3; }
.uc-arr { background: #FFF3E0; border-color: #FFCC80; }
.uc-lea { background: #FFF0EE; border-color: #FFCDD2; }
.uc-new { background: #FFFDE7; border-color: #FFF176; }
.uc-pen { background: #F3E5F5; border-color: #CE93D8; }
.uc-avl { background: #E3F2FD; border-color: #90CAF9; }
.uid { font-family: var(--fh); font-size: 12px; font-weight: 700; color: var(--navy); }
.uten { font-size: 10px; color: var(--sub); margin-top: 2px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 110px; }
.uprice { font-size: 10px; font-weight: 600; color: var(--navy); margin-top: 2px; }
.udot { width: 6px; height: 6px; border-radius: 50%; position: absolute; top: 7px; right: 7px; }
.d-occ { background: #1A7F5A; } .d-arr { background: #E65100; } .d-lea { background: #C0392B; }
.d-new { background: #F9A825; } .d-pen { background: #AB47BC; } .d-avl { background: #1565C0; }

.sp-legend { display: flex; gap: 12px; flex-wrap: wrap; }
.sp-legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--sub); }
.sp-legend-dot { width: 9px; height: 9px; border-radius: 3px; }

.sp-detail { background: #fff; border: 1px solid var(--border); border-radius: var(--r2); padding: 18px 22px; margin-top: 14px; box-shadow: var(--sh); }
.sp-detail-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.sp-detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.sp-detail-label { font-size: 10px; color: var(--sub); font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
.sp-detail-val { font-size: 13px; font-weight: 600; color: var(--navy); margin-top: 2px; word-break: break-all; }

.sp-form { background: var(--mist); border: 1.5px dashed var(--mist2); border-radius: var(--r); padding: 18px 20px; margin-top: 16px; }
.sp-form-title { font-family: var(--fh); font-size: 13px; font-weight: 700; color: var(--navy); margin-bottom: 14px; }
.sp-form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.sp-field { display: flex; flex-direction: column; gap: 4px; }
.sp-field label { font-size: 10px; font-weight: 600; color: var(--sub); text-transform: uppercase; letter-spacing: .5px; }
.sp-field input, .sp-field select { font-family: var(--fb); font-size: 13px; padding: 7px 10px; border: 1.5px solid var(--mist2); border-radius: 6px; outline: none; width: 100%; background: #fff; color: var(--text); }
.sp-field input:focus, .sp-field select:focus { border-color: var(--navy2); }

/* ── Edit Modal ──────────────────────────────────────────────────────────── */
.modal-ov { position: fixed; inset: 0; background: rgba(11,30,61,.55); z-index: 200; display: flex; align-items: center; justify-content: center; animation: fi .15s; padding: 20px; }
.modal { background: #fff; border-radius: 14px; width: 580px; max-width: 100%; box-shadow: var(--shl); max-height: 90vh; overflow-y: auto; animation: su .2s; }
.modal-header { padding: 20px 22px 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
.modal-title { font-family: var(--fh); font-size: 16px; font-weight: 700; color: var(--navy); }
.modal-close { background: var(--mist); border: none; border-radius: 6px; width: 28px; height: 28px; cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center; color: var(--sub); }
.modal-body { padding: 20px 22px; }
.modal-footer { padding: 14px 22px; display: flex; gap: 9px; justify-content: flex-end; border-top: 1px solid var(--border); }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-grid-item { display: flex; flex-direction: column; gap: 4px; }
.form-grid-item.full { grid-column: span 2; }
.form-grid-item label { font-size: 11px; font-weight: 600; color: var(--sub); text-transform: uppercase; letter-spacing: .5px; }
.form-grid-item input, .form-grid-item select, .form-grid-item textarea { font-family: var(--fb); font-size: 13px; padding: 8px 11px; border: 1.5px solid var(--mist2); border-radius: 7px; outline: none; width: 100%; color: var(--text); }
.form-grid-item input:focus, .form-grid-item select:focus, .form-grid-item textarea:focus { border-color: var(--gold); }
.form-grid-item textarea { resize: vertical; min-height: 60px; }
.form-section-label { font-size: 12px; font-weight: 700; color: var(--navy); border-top: 1px solid var(--border); padding-top: 12px; margin-top: 4px; grid-column: span 2; }
.modal-btn { display: inline-flex; align-items: center; gap: 6px; font-family: var(--fb); font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: 7px; border: none; cursor: pointer; transition: all .15s; }
.modal-btn-primary { background: var(--gold); color: var(--navy); }
.modal-btn-primary:hover { background: var(--gold2); }
.modal-btn-outline { background: transparent; color: var(--navy); border: 1.5px solid var(--border); }
.modal-btn-outline:hover { border-color: var(--navy2); }
.modal-btn-danger { background: #FFF0EE; color: var(--danger); border: 1.5px solid #FFCDD2; }
.modal-btn-archive { background: #FFF8E6; color: var(--warning); border: 1.5px solid #FFE0A0; }
.modal-btn:disabled { opacity: .5; cursor: not-allowed; }
.unsaved-badge { font-size: 11px; color: var(--gold); font-weight: 600; }

@keyframes fi { from { opacity: 0; } to { opacity: 1; } }
@keyframes su { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }


.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.gap-4 { gap: 16px; }
.mb-1 { margin-bottom: 4px; }
.mb-2 { margin-bottom: 8px; }
.mb-3 { margin-bottom: 12px; }
.mb-4 { margin-bottom: 16px; }
.mb-6 { margin-bottom: 24px; }
.mt-2 { margin-top: 8px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 640px) { .grid-2 { grid-template-columns: 1fr; } }

/* ── Overlay / sidebar backdrop ──────────────────────────────────────────── */
.backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.35);
  z-index: 90;
}

.backdrop.open { display: block; }

/* ── Toast ───────────────────────────────────────────────────────────────── */
.toast-wrap {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  background: var(--text);
  color: #fff;
  font-size: 13px;
  padding: 10px 16px;
  border-radius: var(--r);
  box-shadow: var(--shl);
  animation: slideUp .2s ease;
  max-width: 320px;
}

.toast.success { background: var(--success); }
.toast.error { background: var(--danger); }

@keyframes slideUp {
  from { transform: translateY(12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* ── Table ───────────────────────────────────────────────────────────────── */
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th {
  text-align: left;
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: var(--sub);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.data-table td {
  padding: 11px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  vertical-align: middle;
}

.data-table tr:last-child td { border-bottom: none; }

.data-table tbody tr {
  transition: background .1s;
  cursor: pointer;
}

.data-table tbody tr:hover { background: var(--mist); }
`;

// ─── Icons (inline SVG) ───────────────────────────────────────────────────
const Icon = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  tenants:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  siteplan:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
  payments:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>,
  documents: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  crm:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  archive:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  settings:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  users:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  signout:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  menu:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
};

// ─── Toast ────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, type = "info") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return { toasts, toast };
}

// ─── Login Page ───────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("login"); // login | mfa-verify | mfa-enroll | forgot
  const [sessionData, setSessionData] = useState(null);
  const [mfaCode, setMfaCode] = useState(["", "", "", "", "", ""]);
  const [factorId, setFactorId] = useState(null);
  const [challengeId, setChallengeId] = useState(null);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const digitRefs = useRef([]);

  async function handleLogin(e) {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const data = await signIn(email, password);
      const factors = await mfaListFactors(data.access_token);
      const totp = factors.find(f => f.factor_type === "totp" && f.status === "verified");
      if (totp) {
        const ch = await mfaChallenge(totp.id, data.access_token);
        setFactorId(totp.id);
        setChallengeId(ch.id);
        setSessionData(data);
        setStage("mfa-verify");
      } else {
        onLogin(data);
      }
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }

  async function handleMfaVerify() {
    setErr(""); setLoading(true);
    const code = mfaCode.join("");
    try {
      const r = await mfaVerify(factorId, challengeId, code, sessionData.access_token);
      if (r.error) throw new Error(r.error.message || "Invalid code");
      const upgraded = await refreshSession(sessionData.refresh_token);
      onLogin(upgraded || sessionData);
    } catch (e) {
      setErr(e.message);
      setMfaCode(["", "", "", "", "", ""]);
      digitRefs.current[0]?.focus();
    }
    setLoading(false);
  }

  async function handleMfaEnroll() {
    setErr(""); setLoading(true);
    try {
      const { totp, id } = await mfaEnroll(sessionData.access_token);
      setFactorId(id);
      setSessionData(d => ({ ...d, qr: totp?.qr_code, secret: totp?.secret }));
      setStage("mfa-setup");
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }

  function handleDigit(i, val) {
    const v = val.replace(/\D/g, "").slice(-1);
    const next = [...mfaCode];
    next[i] = v;
    setMfaCode(next);
    if (v && i < 5) digitRefs.current[i + 1]?.focus();
    if (next.every(d => d) && v) {
      setTimeout(() => {
        const code = next.join("");
        if (code.length === 6) handleMfaVerifyCode(next.join(""));
      }, 80);
    }
  }

  async function handleMfaVerifyCode(code) {
    setErr(""); setLoading(true);
    try {
      const ch = await mfaChallenge(factorId, sessionData.access_token);
      const r = await mfaVerify(factorId, ch.id, code, sessionData.access_token);
      if (r.error) throw new Error(r.error.message || "Invalid code");
      const upgraded = await refreshSession(sessionData.refresh_token);
      onLogin(upgraded || sessionData);
    } catch (e) {
      setErr(e.message);
      setMfaCode(["", "", "", "", "", ""]);
      digitRefs.current[0]?.focus();
    }
    setLoading(false);
  }

  function handleDigitKey(i, e) {
    if (e.key === "Backspace" && !mfaCode[i] && i > 0) {
      digitRefs.current[i - 1]?.focus();
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="brand-logo">
          <div className="brand-wordmark">cerect<span>.</span></div>
        </div>
        <div className="brand-tagline">
          Storage management<br />
          built for <em>operators</em>
        </div>
        <div className="brand-sub">
          Everything you need to run a storage facility — tenants, payments, documents, and waiting lists — in one place.
        </div>
        <div className="brand-dots">
          <div className="brand-dot active" />
          <div className="brand-dot" />
          <div className="brand-dot" />
        </div>
      </div>

      <div className="login-form-wrap">
        <div className="login-box">
          {stage === "login" && (
            <>
              <div className="login-heading">Sign in</div>
              <div className="login-hint">Welcome back. Enter your details below.</div>
              {err && <div className="login-err">{err}</div>}
              <form onSubmit={handleLogin}>
                <div className="login-field">
                  <label>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoFocus required />
                </div>
                <div className="login-field">
                  <label>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                </div>
                <button className="login-btn" type="submit" disabled={loading}>
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>
              <button className="login-link" onClick={() => setStage("forgot")}>Forgot password?</button>
            </>
          )}

          {stage === "mfa-verify" && (
            <>
              <div className="login-heading">Two-factor auth</div>
              <div className="login-hint">Enter the 6-digit code from your authenticator app.</div>
              {err && <div className="login-err">{err}</div>}
              <div className="login-mfa-box">
                <div className="login-mfa-title">Authenticator code</div>
                <div className="login-mfa-sub">Open Google Authenticator or Authy</div>
              </div>
              <div className="mfa-digits">
                {mfaCode.map((d, i) => (
                  <input
                    key={i}
                    ref={el => digitRefs.current[i] = el}
                    className="mfa-digit"
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => handleDigitKey(i, e)}
                  />
                ))}
              </div>
              <button className="login-btn" onClick={handleMfaVerify} disabled={loading || mfaCode.join("").length < 6}>
                {loading ? "Verifying…" : "Verify"}
              </button>
              <button className="login-link" onClick={() => { setStage("login"); setMfaCode(["","","","","",""]); }}>Back to sign in</button>
            </>
          )}

          {stage === "mfa-enroll" && (
            <>
              <div className="login-heading">Set up 2FA</div>
              <div className="login-hint">Two-factor authentication is required. You'll need an authenticator app.</div>
              {err && <div className="login-err">{err}</div>}
              <div className="login-mfa-box">
                <div className="login-mfa-title">Required for your account</div>
                <div className="login-mfa-sub">Download Google Authenticator or Authy, then continue</div>
              </div>
              <button className="login-btn" onClick={handleMfaEnroll} disabled={loading}>
                {loading ? "Setting up…" : "Continue with authenticator"}
              </button>
            </>
          )}

          {stage === "mfa-setup" && (
            <>
              <div className="login-heading">Scan QR code</div>
              <div className="login-hint">Scan this with your authenticator app, then enter the 6-digit code.</div>
              {err && <div className="login-err">{err}</div>}
              {sessionData?.qr && (
                <div style={{ textAlign: "center", margin: "16px 0" }}>
                  <img src={sessionData.qr} alt="QR code" style={{ width: 180, height: 180, border: "1px solid var(--border)", borderRadius: 8, display: "block", margin: "0 auto" }} onError={e => e.target.style.display="none"} /><p style={{ fontSize: 12, color: "var(--sub)", marginTop: 8 }}>If the QR code does not appear, use the secret key below to add manually.</p>
                </div>
              )}
              {sessionData?.secret && (
                <div style={{ background: "var(--mist)", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 13, textAlign: "center", marginBottom: 16, wordBreak: "break-all", color: "var(--sub)" }}>
                  {sessionData.secret}
                </div>
              )}
              <div className="mfa-digits">
                {mfaCode.map((d, i) => (
                  <input
                    key={i}
                    ref={el => digitRefs.current[i] = el}
                    className="mfa-digit"
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => handleDigitKey(i, e)}
                  />
                ))}
              </div>
              <button className="login-btn" onClick={() => handleMfaVerifyCode(mfaCode.join(""))} disabled={loading || mfaCode.join("").length < 6}>
                {loading ? "Verifying…" : "Activate 2FA"}
              </button>
            </>
          )}

          {stage === "forgot" && (
            <>
              <div className="login-heading">Reset password</div>
              <div className="login-hint">Enter your email and we'll send a temporary password.</div>
              {err && <div className="login-err">{err}</div>}
              {forgotSent
                ? <div className="login-ok">Check your email — a temporary password has been sent.</div>
                : (
                  <>
                    <div className="login-field">
                      <label>Email</label>
                      <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="you@company.com" autoFocus />
                    </div>
                    <button className="login-btn" onClick={async () => {
                      setLoading(true); setErr("");
                      try {
                        const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resetPassword", email: forgotEmail }) });
                        const d = await r.json();
                        if (d.error) throw new Error(d.error);
                        await fetch("/api/send-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: forgotEmail, tempPassword: d.tempPass }) });
                        setForgotSent(true);
                      } catch (e) { setErr(e.message); }
                      setLoading(false);
                    }} disabled={loading || !forgotEmail}>
                      {loading ? "Sending…" : "Send temporary password"}
                    </button>
                  </>
                )
              }
              <button className="login-link" onClick={() => { setStage("login"); setForgotSent(false); setErr(""); }}>Back to sign in</button>
            </>
          )}

          <div className="login-footer">
            &copy; {new Date().getFullYear()} Cerect. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Placeholder page ─────────────────────────────────────────────────────
function ComingSoon({ title, icon }) {
  return (
    <div className="coming-soon">
      <svg className="coming-soon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">{icon}</svg>
      <div className="coming-soon-title">{title}</div>
      <div className="coming-soon-sub">This section is coming soon.</div>
    </div>
  );
}

// ─── Small shared components ──────────────────────────────────────────────────
function Pill({ s }) {
  const cls = { occupied: "pill-occupied", arrears: "pill-arrears", leaving: "pill-leaving", new: "pill-new", pending: "pill-pending", available: "pill-available" };
  return <span className={`pill ${cls[s] || "pill-occupied"}`}>{SL[s] || s}</span>;
}

function UCell({ u, sel, onClick }) {
  const isVacant = u.status === "available" || u.status === "vacant" || (!u.status && !u.tenant);
  return (
    <div
      className={`uc ${UC[u.status] || "uc-avl"} ${sel ? "sel" : ""}`}
      onClick={onClick}
      title={isVacant ? `Unit ${u.id} — click to add tenant` : u.tenant || u.id}
    >
      <div className={`udot ${DC[u.status] || "d-avl"}`} />
      <div className="uid">{u.id}</div>
      {u.tenant && <div className="uten">{u.tenant}</div>}
      {u.rent && <div className="uprice">£{u.rent}/mo</div>}
      {isVacant && !u.tenant && <div style={{ fontSize: 8, opacity: 0.5, marginTop: 1 }}>+ tenant</div>}
    </div>
  );
}

function Legend() {
  return (
    <div className="sp-legend">
      {[["#1A7F5A", "Occupied"], ["#E65100", "In Arrears"], ["#C0392B", "Leaving"], ["#F9A825", "New Customer"], ["#AB47BC", "Pending"], ["#1565C0", "Available"]].map(([c, l]) => (
        <div key={l} className="sp-legend-item">
          <div className="sp-legend-dot" style={{ background: c }} />
          {l}
        </div>
      ))}
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ item, onClose, onSave, onDelete, onArchive, isNew, areas = [], existingIds = [] }) {
  const [form, setForm] = useState({ ...item });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedForm, setSavedForm] = useState({ ...item });
  const [showNewArea, setShowNewArea] = useState(false);
  const [newArea, setNewArea] = useState("");

  function formsEqual(a, b) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const av = a[k] == null ? "" : String(a[k]);
      const bv = b[k] == null ? "" : String(b[k]);
      if (av !== bv) return false;
    }
    return true;
  }

  const isDirty = !formsEqual(form, savedForm);
  const u = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const n = k => e => setForm(f => ({ ...f, [k]: e.target.value === "" ? null : Number(e.target.value) }));

  function handleClose() {
    if (isDirty && !window.confirm("You have unsaved changes. Close without saving?")) return;
    onClose();
  }

  async function save() {
    setSaving(true);
    await onSave(form);
    setSavedForm({ ...form });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const areaNames = areas.map(a => a.name);

  return (
    <div className="modal-ov" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">
            {isNew ? "Add New Unit / Tenant" : `Edit — ${form.label || "Unit " + form.id}`}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isDirty && <span className="unsaved-badge">● Unsaved changes</span>}
            <button className="modal-close" onClick={handleClose}>✕</button>
          </div>
        </div>

        <div className="modal-body">
          <div className="form-grid">
            {/* Category */}
            {isNew && (
              <div className="form-grid-item">
                <label>Category</label>
                <select value={form.category || "Storage"} onChange={u("category")}>
                  {["Storage", "Residential", "Commercial"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            )}

            {/* Unit ID — Storage only */}
            {isNew && form.category === "Storage" && (
              <div className="form-grid-item">
                <label>Unit ID *</label>
                <input value={form.id || ""} onChange={u("id")} placeholder="e.g. 73, A4, FP32" />
              </div>
            )}

            {/* Property name — Residential/Commercial */}
            {(form.category === "Residential" || form.category === "Commercial") && (
              <div className="form-grid-item full">
                <label>Property Name</label>
                <input
                  value={form.label || ""}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value, ...(f.id ? {} : { id: e.target.value.replace(/\s+/g, "").replace(/[^a-zA-Z0-9._-]/g, "_") }) }))}
                  placeholder="e.g. 14 High Street, Unit 3B"
                />
              </div>
            )}

            {/* Tenant name */}
            <div className="form-grid-item full">
              <label>Tenant Name</label>
              <input value={form.tenant || ""} onChange={u("tenant")} />
            </div>

            {/* Address */}
            <div className="form-grid-item full">
              <label>Address</label>
              <textarea value={form.address || ""} onChange={u("address")} placeholder="Tenant's home or business address…" style={{ minHeight: 60 }} />
            </div>

            {/* Contact */}
            <div className="form-grid-item">
              <label>Email</label>
              <input type="email" value={form.email || ""} onChange={u("email")} />
            </div>
            <div className="form-grid-item">
              <label>Phone</label>
              <input value={form.phone || ""} onChange={u("phone")} />
            </div>

            {/* Status & Payment */}
            <div className="form-grid-item">
              <label>Status</label>
              <select value={form.status || "occupied"} onChange={u("status")}>
                {STATUSES.map(s => <option key={s} value={s}>{SL[s]}</option>)}
              </select>
            </div>
            <div className="form-grid-item">
              <label>Payment Method</label>
              <select value={form.payment || ""} onChange={u("payment")}>
                <option value="">— Select —</option>
                {PAYMENTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Rent */}
            <div className="form-grid-item">
              <label>Rent (ex-VAT) £/mo</label>
              <input type="number" value={form.rent || ""} onChange={n("rent")} />
            </div>
            <div className="form-grid-item">
              <label>Rent (inc-VAT) £/mo</label>
              <input type="number" value={form.vat_rent || ""} onChange={n("vat_rent")} />
            </div>

            {/* Deposits section */}
            <div className="form-section-label">Deposits & Keys</div>
            <div className="form-grid-item">
              <label>Lock/Fob Deposit Paid</label>
              <select value={form.lock_deposit_paid || ""} onChange={u("lock_deposit_paid")}>
                <option value="">— Select —</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
            <div className="form-grid-item">
              <label>Lock/Fob Deposit Amount £</label>
              <input type="number" value={form.lock_deposit_amount || ""} onChange={n("lock_deposit_amount")} placeholder="e.g. 50" />
            </div>
            <div className="form-grid-item">
              <label>Tenant Deposit Held £</label>
              <input type="number" value={form.tenant_deposit || ""} onChange={n("tenant_deposit")} placeholder="e.g. 20" />
            </div>
            <div className="form-grid-item">
              <label>Key / Lock Number</label>
              <input value={form.key_number || ""} onChange={u("key_number")} placeholder="e.g. 005, 33222" />
            </div>

            {/* Storage-specific */}
            {form.category === "Storage" && (
              <>
                <div className="form-section-label">Unit Details</div>
                <div className="form-grid-item">
                  <label>Row / Location</label>
                  {showNewArea ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        style={{ flex: 1, fontFamily: "var(--fb)", fontSize: 13, padding: "8px 11px", border: "1.5px solid var(--gold)", borderRadius: 7, outline: "none" }}
                        value={newArea}
                        onChange={e => setNewArea(e.target.value)}
                        placeholder="New area name e.g. Row 8"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === "Enter" && newArea.trim()) {
                            setForm(f => ({ ...f, row_name: newArea.trim() }));
                            setShowNewArea(false);
                            setNewArea("");
                          }
                        }}
                      />
                      <button className="modal-btn modal-btn-primary" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => { if (newArea.trim()) { setForm(f => ({ ...f, row_name: newArea.trim() })); setShowNewArea(false); setNewArea(""); } }}>✓</button>
                      <button className="modal-btn modal-btn-outline" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => { setShowNewArea(false); setNewArea(""); }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 6 }}>
                      <select
                        style={{ flex: 1, fontFamily: "var(--fb)", fontSize: 13, padding: "8px 11px", border: "1.5px solid var(--mist2)", borderRadius: 7, outline: "none" }}
                        value={form.row_name || ""}
                        onChange={e => setForm(f => ({ ...f, row_name: e.target.value }))}
                      >
                        <option value="">— Select area —</option>
                        {areaNames.map(a => <option key={a} value={a}>{a}</option>)}
                        {form.row_name && !areaNames.includes(form.row_name) && (
                          <option value={form.row_name}>{form.row_name} (new)</option>
                        )}
                      </select>
                      <button className="modal-btn modal-btn-outline" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => setShowNewArea(true)} title="Add new area">+</button>
                    </div>
                  )}
                </div>
                <div className="form-grid-item">
                  <label>Box Number</label>
                  <input value={form.box_no || ""} onChange={u("box_no")} />
                </div>
                <div className="form-grid-item">
                  <label>Size</label>
                  <input value={form.size || ""} onChange={u("size")} placeholder="e.g. XL(20ft)" />
                </div>
              </>
            )}

            {/* Residential/Commercial — Lease Review */}
            {(form.category === "Residential" || form.category === "Commercial") && (
              <div className="form-grid-item">
                <label>Lease Review Date</label>
                <input type="date" value={form.review || ""} onChange={u("review")} />
              </div>
            )}

            {/* Dates */}
            <div className="form-grid-item">
              <label>Move-in Date</label>
              <input type="date" value={form.move_in_date || ""} onChange={u("move_in_date")} />
            </div>
            <div className="form-grid-item">
              <label>Move-out Date</label>
              <input type="date" value={form.move_out_date || ""} onChange={e => {
                const val = e.target.value;
                setForm(f => ({ ...f, move_out_date: val, status: val && new Date(val) <= new Date() ? "leaving" : f.status }));
              }} />
            </div>

            {/* Notes */}
            <div className="form-grid-item full">
              <label>Notes</label>
              <textarea value={form.notes || ""} onChange={u("notes")} placeholder="Additional notes, special requirements…" />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {!isNew && <button className="modal-btn modal-btn-danger" onClick={() => { onDelete(form.id); onClose(); }}>Delete</button>}
          {!isNew && onArchive && <button className="modal-btn modal-btn-archive" onClick={() => { onArchive(form.id); onClose(); }}>📦 Archive</button>}
          <button className="modal-btn modal-btn-outline" onClick={handleClose}>Close</button>
          <button className="modal-btn modal-btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : saved ? "✅ Saved!" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Site Plan ────────────────────────────────────────────────────────────────
function SitePlanPage({ data, areas, onEdit, onAdd, onDelete, onRenameRow, onDeleteRow, onSaveAreaOrder, onAddArea, onSaveUnitOrder }) {
  const [sel, setSel] = useState(null);
  const [filt, setFilt] = useState("all");
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [showAddArea, setShowAddArea] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editingRowName, setEditingRowName] = useState("");
  const [newAreaName, setNewAreaName] = useState("");
  const [newUnit, setNewUnit] = useState({ id: "", category: "Storage", row_name: "", size: "", box_no: "", status: "available" });
  const [dragOver, setDragOver] = useState(null);
  const [dragOverUnit, setDragOverUnit] = useState(null);
  const dragRow = useRef(null);
  const dragUnit = useRef(null);
  const detailRef = useRef(null);

  const rowOrder = areas.map(a => a.name);
  const stor = data.filter(d => d.category === "Storage");
  const fu = arr => filt === "all" ? arr : arr.filter(u => u.status === filt);
  const selU = stor.find(u => u.id === sel);
  const nu = k => e => setNewUnit(f => ({ ...f, [k]: e.target.value }));

  // ── Area drag ──
  function handleAreaDragStart(e, row) { dragRow.current = row; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", row); }
  function handleAreaDragOver(e, row) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(row); }
  function handleAreaDrop(e, targetRow) {
    e.preventDefault();
    const fromRow = dragRow.current || (() => { try { return e.dataTransfer.getData("text/plain"); } catch { return null; } })();
    dragRow.current = null; setDragOver(null);
    if (!fromRow || fromRow === targetRow) return;
    const newOrder = [...rowOrder];
    const fromIdx = newOrder.indexOf(fromRow);
    const toIdx = newOrder.indexOf(targetRow);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...newOrder];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, fromRow);
    if (onSaveAreaOrder) onSaveAreaOrder(reordered);
  }
  function handleAreaDragEnd() { dragRow.current = null; setDragOver(null); }

  // ── Unit drag ──
  function handleUnitDragStart(e, unit) { dragUnit.current = unit; e.dataTransfer.effectAllowed = "move"; }
  function handleUnitDrop(e, targetId, rowUnits, targetRow) {
    e.preventDefault(); e.stopPropagation();
    const fromUnit = dragUnit.current;
    if (!fromUnit || fromUnit.id === targetId) { setDragOverUnit(null); return; }
    const updates = [];
    const targetSorted = [...rowUnits].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const toIdx = targetSorted.findIndex(u => u.id === targetId);
    if (fromUnit.row_name === targetRow) {
      const withoutFrom = targetSorted.filter(u => u.id !== fromUnit.id);
      withoutFrom.splice(toIdx, 0, fromUnit);
      withoutFrom.forEach((u, i) => updates.push({ id: u.id, sort_order: i, row_name: targetRow }));
    } else {
      data.filter(u => u.row_name === fromUnit.row_name && u.id !== fromUnit.id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .forEach((u, i) => updates.push({ id: u.id, sort_order: i, row_name: u.row_name }));
      const newTarget = [...targetSorted];
      newTarget.splice(toIdx < 0 ? newTarget.length : toIdx, 0, { ...fromUnit, row_name: targetRow });
      newTarget.forEach((u, i) => updates.push({ id: u.id, sort_order: i, row_name: targetRow }));
    }
    if (onSaveUnitOrder) onSaveUnitOrder(updates);
    dragUnit.current = null; setDragOverUnit(null);
  }

  function selectUnit(id) {
    setSel(prev => {
      if (prev === id) return null;
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
      return id;
    });
  }

  function submitNewUnit() {
    if (!newUnit.id.trim()) { alert("Please enter a Unit ID"); return; }
    const exists = stor.find(u => u.id === newUnit.id.trim());
    if (exists) { alert(`Unit "${newUnit.id.trim()}" already exists in ${exists.row_name || "this area"}. Please choose a different ID.`); return; }
    onAdd({ ...newUnit, id: newUnit.id.trim(), rent: null, vat_rent: null, email: null, phone: null, label: null, review: null, notes: null, tenant: null });
    setNewUnit({ id: "", category: "Storage", row_name: "", size: "", box_no: "", status: "available" });
    setShowAddUnit(false);
  }

  function confirmRenameRow() {
    if (!editingRowName.trim()) return;
    onRenameRow(editingRow, editingRowName.trim());
    setEditingRow(null);
  }

  function confirmDeleteRow(row) {
    const units = stor.filter(u => u.row_name === row);
    const occupied = units.filter(u => u.tenant);
    const msg = occupied.length > 0
      ? `Delete "${row}"?\n\nThis area has ${units.length} unit(s), ${occupied.length} of which ${occupied.length === 1 ? "is" : "are"} occupied:\n${occupied.map(u => `• Unit ${u.id} — ${u.tenant}`).join("\n")}\n\nThis cannot be undone.`
      : `Delete "${row}" and all ${units.length} unit(s) in it?\n\nThis cannot be undone.`;
    if (window.confirm(msg)) onDeleteRow(row);
  }

  async function confirmAddArea() {
    if (!newAreaName.trim()) return;
    if (onAddArea) await onAddArea(newAreaName.trim());
    setShowAddArea(false);
    setNewAreaName("");
  }

  return (
    <div className="page">
      {/* Toolbar */}
      <div className="sp-toolbar">
        <Legend />
        <div className="sp-filters">
          {["all", ...STATUSES].map(f => (
            <button key={f} className={`sp-btn ${filt === f ? "active" : ""}`} onClick={() => setFilt(f)}>
              {f === "all" ? "All" : SL[f]}
            </button>
          ))}
          {filt === "all" && (
            <>
              <button className="sp-btn sp-btn-primary" onClick={() => { setShowAddUnit(s => !s); setShowAddArea(false); }}>
                {showAddUnit ? "✕ Cancel" : "+ Add Unit"}
              </button>
              <button className="sp-btn sp-btn-navy" onClick={() => { setShowAddArea(s => !s); setShowAddUnit(false); }}>
                {showAddArea ? "✕ Cancel" : "+ Add Area"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Add area form */}
      {showAddArea && (
        <div className="sp-form">
          <div className="sp-form-title">Add New Area</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              className="onboard-input"
              style={{ flex: 1, maxWidth: 320 }}
              value={newAreaName}
              onChange={e => setNewAreaName(e.target.value)}
              placeholder="e.g. Row 7, North Block, Main Barn"
              onKeyDown={e => e.key === "Enter" && confirmAddArea()}
              autoFocus
            />
            <button className="sp-btn sp-btn-primary" onClick={confirmAddArea}>Create Area</button>
          </div>
        </div>
      )}

      {/* Add unit form */}
      {showAddUnit && (
        <div className="sp-form" style={{ marginTop: 12 }}>
          <div className="sp-form-title">Add New Unit to Site Plan</div>
          <div className="sp-form-grid">
            <div className="sp-field"><label>Unit ID *</label><input value={newUnit.id} onChange={nu("id")} placeholder="e.g. 73, A4" /></div>
            <div className="sp-field">
              <label>Area *</label>
              <select value={newUnit.row_name} onChange={nu("row_name")}>
                <option value="">— Select area —</option>
                {rowOrder.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="sp-field">
              <label>Status</label>
              <select value={newUnit.status} onChange={nu("status")}>
                {STATUSES.map(s => <option key={s} value={s}>{SL[s]}</option>)}
              </select>
            </div>
            <div className="sp-field"><label>Size (optional)</label><input value={newUnit.size} onChange={nu("size")} placeholder="e.g. XL(20ft)" /></div>
          </div>
          <p style={{ fontSize: 11, color: "var(--sub)", marginTop: 10 }}>Tenant details, rent, and other info can be added by clicking Edit on the unit afterwards.</p>
          <button className="sp-btn sp-btn-primary" style={{ marginTop: 10 }} onClick={submitNewUnit}>Add Unit</button>
        </div>
      )}

      {/* Area rows */}
      {rowOrder.map(row => {
        const all = stor.filter(u => u.row_name === row);
        const isDragTarget = dragOver === row && dragRow.current && !dragUnit.current;
        return (
          <div
            key={row}
            className="sp-area"
            style={{ opacity: isDragTarget ? 0.5 : 1, outline: isDragTarget ? "2px dashed var(--gold)" : "none", borderRadius: 8, transition: "opacity .15s" }}
            onDragOver={e => { if (dragRow.current && !dragUnit.current) handleAreaDragOver(e, row); else e.preventDefault(); }}
            onDragEnter={e => { e.preventDefault(); if (dragRow.current && !dragUnit.current) setDragOver(row); }}
            onDrop={e => { if (dragUnit.current) return; handleAreaDrop(e, row); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
          >
            <div className="sp-area-header">
              {editingRow === row ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    value={editingRowName}
                    onChange={e => setEditingRowName(e.target.value)}
                    style={{ fontFamily: "var(--fb)", fontSize: 14, padding: "6px 10px", border: "1.5px solid var(--gold)", borderRadius: 7, outline: "none", width: 200 }}
                    onKeyDown={e => e.key === "Enter" && confirmRenameRow()}
                    autoFocus
                  />
                  <button className="sp-btn sp-btn-primary" style={{ fontSize: 11, padding: "5px 10px" }} onClick={confirmRenameRow}>✓ Save</button>
                  <button className="sp-btn" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => setEditingRow(null)}>✕</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className="sp-drag-handle"
                    draggable
                    onDragStart={e => handleAreaDragStart(e, row)}
                    onDragEnd={handleAreaDragEnd}
                    title="Drag to reorder"
                  >⠿</span>
                  <span className="sp-area-title">{row}</span>
                  <span className="sp-area-count">{all.length} units</span>
                </div>
              )}
              {editingRow !== row && filt === "all" && (
                <div className="sp-area-actions">
                  <button className="sp-btn" style={{ fontSize: 11 }} onClick={() => { setEditingRow(row); setEditingRowName(row); }}>✏️ Rename</button>
                  <button className="sp-btn sp-btn-danger" style={{ fontSize: 11 }} onClick={() => confirmDeleteRow(row)}>🗑️ Delete Area</button>
                </div>
              )}
            </div>

            <div className="ug">
              {fu([...all].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))).map(u => (
                <div
                  key={u.id}
                  draggable={filt === "all"}
                  onDragStart={e => handleUnitDragStart(e, u)}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverUnit(u.id); }}
                  onDrop={e => handleUnitDrop(e, u.id, [...all].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), row)}
                  onDragEnd={() => { dragUnit.current = null; setDragOverUnit(null); }}
                  style={{ opacity: dragOverUnit === u.id && dragUnit.current?.id !== u.id ? 0.5 : 1, outline: dragOverUnit === u.id && dragUnit.current?.id !== u.id ? "2px dashed var(--gold)" : "none", borderRadius: 8 }}
                >
                  <UCell u={u} sel={sel === u.id} onClick={() => selectUnit(u.id)} />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Unassigned units */}
      {stor.filter(u => !u.row_name).length > 0 && (
        <div className="sp-area">
          <div className="sp-area-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--fh)", fontSize: 15, fontWeight: 700, color: "var(--danger)" }}>⚠️ Unassigned</span>
              <span className="sp-area-count" style={{ background: "#FFF0EE", borderColor: "#FFCDD2", color: "var(--danger)" }}>{stor.filter(u => !u.row_name).length} units — no area set</span>
            </div>
          </div>
          <div className="ug">
            {fu(stor.filter(u => !u.row_name)).map(u => <UCell key={u.id} u={u} sel={sel === u.id} onClick={() => selectUnit(u.id)} />)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {rowOrder.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--sub)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏭</div>
          <div style={{ fontFamily: "var(--fh)", fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>No areas yet</div>
          <div style={{ fontSize: 14, marginBottom: 24 }}>Start by adding an area, then add your storage units to it.</div>
          <button className="sp-btn sp-btn-navy" onClick={() => setShowAddArea(true)}>+ Add Your First Area</button>
        </div>
      )}

      {/* Detail panel */}
      {selU && (
        <div className="sp-detail" ref={detailRef}>
          <div className="sp-detail-header">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--fh)", fontWeight: 700, fontSize: 15 }}>Unit {selU.id}</span>
              <Pill s={selU.status} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="sp-btn sp-btn-primary" onClick={() => onEdit(selU)}>✏️ Edit</button>
              <button className="sp-btn sp-btn-danger" onClick={() => {
                const msg = selU.tenant
                  ? `Delete Unit ${selU.id}? This cannot be undone.`
                  : `Permanently delete empty Unit ${selU.id}? This cannot be undone.`;
                if (window.confirm(msg)) { onDelete(selU.id); setSel(null); }
              }}>🗑️ Delete</button>
              <button className="sp-btn" onClick={() => setSel(null)}>✕ Close</button>
            </div>
          </div>
          <div className="sp-detail-grid">
            {[
              ["Box Ref", selU.box_no || "—"],
              ["Size", selU.size || "—"],
              ["Area", selU.row_name || "—"],
              ["Tenant", selU.tenant || "Vacant"],
              ["Payment", selU.payment || "—"],
              ["Rent (ex-VAT)", selU.rent ? "£" + selU.rent : "—"],
              ["Rent (inc-VAT)", selU.vat_rent ? "£" + selU.vat_rent : "—"],
              ["Email", selU.email || "—"],
              ["Phone", selU.phone || "—"],
              ["Key / Lock No.", selU.key_number || "—"],
              ["Lock Deposit Paid", selU.lock_deposit_paid || "—"],
              ["Lock Deposit Amt", selU.lock_deposit_amount ? "£" + selU.lock_deposit_amount : "—"],
              ["Tenant Deposit", selU.tenant_deposit ? "£" + selU.tenant_deposit : "—"],
              ["Move-in", selU.move_in_date || "—"],
              ["Notes", selU.notes || "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="sp-detail-label">{k}</div>
                <div className="sp-detail-val">{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tenants Page ────────────────────────────────────────────────────────────
const DEFAULT_COLS = [
  { key: "unit",     label: "Unit" },
  { key: "category", label: "Category" },
  { key: "tenant",   label: "Tenant" },
  { key: "size",     label: "Size" },
  { key: "payment",  label: "Payment" },
  { key: "exvat",    label: "Ex-VAT" },
  { key: "incvat",   label: "Inc-VAT" },
  { key: "email",    label: "Email" },
  { key: "status",   label: "Status" },
];

function TenantsPage({ data, onEdit, onAdd, onArchive, setPage }) {
  const [q, setQ] = useState("");
  const [filt, setFilt] = useState("all");
  const [cat, setCat] = useState("all");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [selected, setSelected] = useState(new Set());
  const [cols, setCols] = useState(() => {
    try { const s = localStorage.getItem("cerect_col_order"); return s ? JSON.parse(s) : DEFAULT_COLS; } catch { return DEFAULT_COLS; }
  });
  const dragCol = useRef(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  function toggleSelect(id) { setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleAll() { setSelected(s => s.size === sorted.length ? new Set() : new Set(sorted.map(t => t.id))); }
  function clearSelected() { setSelected(new Set()); }

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function sortArrow(key) {
    if (sortKey !== key) return <span style={{ opacity: 0.25, marginLeft: 3 }}>↕</span>;
    return <span style={{ marginLeft: 3 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function handleColDragStart(e, key) { dragCol.current = key; e.dataTransfer.effectAllowed = "move"; }
  function handleColDragOver(e, key) { e.preventDefault(); setDragOverCol(key); }
  function handleColDrop(e, targetKey) {
    e.preventDefault();
    if (!dragCol.current || dragCol.current === targetKey) return;
    const newCols = [...cols];
    const fromIdx = newCols.findIndex(c => c.key === dragCol.current);
    const toIdx = newCols.findIndex(c => c.key === targetKey);
    newCols.splice(fromIdx, 1);
    newCols.splice(toIdx, 0, cols[fromIdx]);
    setCols(newCols);
    try { localStorage.setItem("cerect_col_order", JSON.stringify(newCols)); } catch {}
    dragCol.current = null;
    setDragOverCol(null);
  }
  function handleColDragEnd() { dragCol.current = null; setDragOverCol(null); }

  const filtered = data.filter(t => {
    const ms = filt === "all" || t.status === filt;
    const mc = cat === "all" || t.category === cat;
    const mq = !q ||
      (t.tenant || "").toLowerCase().includes(q.toLowerCase()) ||
      (t.id || "").toLowerCase().includes(q.toLowerCase()) ||
      (t.email || "").toLowerCase().includes(q.toLowerCase()) ||
      (t.label || "").toLowerCase().includes(q.toLowerCase());
    return ms && mc && mq;
  });

  const rev = filtered
    .filter(t => t.rent && ["occupied", "arrears", "new"].includes(t.status))
    .reduce((a, b) => a + (Number(b.rent) || 0), 0);

  const sorted = sortKey ? [...filtered].sort((a, b) => {
    let av, bv;
    if (sortKey === "exvat" || sortKey === "incvat") {
      av = Number(sortKey === "exvat" ? a.rent : a.vat_rent) || 0;
      bv = Number(sortKey === "exvat" ? b.rent : b.vat_rent) || 0;
    } else if (sortKey === "tenant") {
      av = (a.tenant || "").toLowerCase(); bv = (b.tenant || "").toLowerCase();
    } else if (sortKey === "unit") {
      av = (a.label || a.id || "").toLowerCase(); bv = (b.label || b.id || "").toLowerCase();
    } else {
      av = (a[sortKey] || "").toString().toLowerCase(); bv = (b[sortKey] || "").toString().toLowerCase();
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  }) : filtered;

  function renderCell(t, key) {
    switch (key) {
      case "unit":     return <td key={key} style={{ fontFamily: "var(--fh)", fontWeight: 700, whiteSpace: "nowrap" }}>{t.label || ("Unit " + t.id)}</td>;
      case "category": return <td key={key}><span style={{ fontSize: 11, padding: "2px 8px", background: "var(--mist)", border: "1px solid var(--mist2)", borderRadius: 5, fontWeight: 500, color: "var(--sub)" }}>{t.category}</span></td>;
      case "tenant":   return <td key={key} style={{ maxWidth: 180 }}>{t.tenant || <span style={{ color: "var(--sub)" }}>Vacant</span>}</td>;
      case "size":     return <td key={key} style={{ fontSize: 12 }}>{t.size || "—"}</td>;
      case "payment":  return <td key={key}>{t.payment ? <span style={{ fontSize: 11, padding: "2px 8px", background: "var(--mist)", border: "1px solid var(--mist2)", borderRadius: 5, color: "var(--sub)" }}>{t.payment}</span> : "—"}</td>;
      case "exvat":    return <td key={key} style={{ fontWeight: 600 }}>{t.rent ? "£" + t.rent : "—"}</td>;
      case "incvat":   return <td key={key}>{t.vat_rent ? "£" + t.vat_rent : "—"}</td>;
      case "email":    return <td key={key} style={{ fontSize: 11, color: "var(--sub)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.email || "—"}</td>;
      case "status":   return <td key={key}><Pill s={t.status} /></td>;
      default:         return <td key={key}>—</td>;
    }
  }

  return (
    <div className="page">
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <input
            style={{ fontFamily: "var(--fb)", fontSize: 14, padding: "8px 14px", border: "1.5px solid var(--mist2)", borderRadius: "var(--r)", outline: "none", width: 240, color: "var(--text)" }}
            placeholder="Search tenant, unit, email…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {["all", "Storage", "Residential", "Commercial"].map(c => (
            <button key={c} className={`sp-btn ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>
              {c === "all" ? "All" : c}
            </button>
          ))}
          {["all", ...STATUSES].map(f => (
            <button key={f} className={`sp-btn ${filt === f ? "active" : ""}`} onClick={() => setFilt(f)}>
              {f === "all" ? "All Statuses" : SL[f]}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="sp-btn" onClick={() => { setCols(DEFAULT_COLS); try { localStorage.removeItem("cerect_col_order"); } catch {} }}>↺ Reset</button>
          <button className="sp-btn sp-btn-primary" onClick={onAdd}>+ Add Tenant</button>
        </div>
      </div>

      {/* Storage hint */}
      <div style={{ fontSize: 12, color: "#7A5C00", padding: "8px 14px", background: "#FFFBEA", border: "1.5px solid #F6D860", borderRadius: 8, fontWeight: 500, marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
        💡 To add a storage tenant, click a vacant unit on the{" "}
        <span style={{ color: "var(--navy)", fontWeight: 700, textDecoration: "underline", cursor: "pointer" }} onClick={() => setPage("siteplan")}>
          Site Plan
        </span>
      </div>

      {/* Bulk selection bar */}
      {selected.size > 0 && (
        <div style={{ background: "#EEF4FF", border: "1.5px solid #B8D0F8", borderRadius: 8, padding: "10px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--navy)" }}>{selected.size} selected</span>
          <button className="sp-btn" onClick={() => {
            if (!window.confirm(`Archive ${selected.size} tenant(s)?`)) return;
            selected.forEach(id => onArchive(id));
            clearSelected();
          }}>📦 Archive selected</button>
          <button className="sp-btn sp-btn-danger" onClick={() => {
            if (!window.confirm(`Delete ${selected.size} tenant(s)? This cannot be undone.`)) return;
            selected.forEach(id => onArchive(id));
            clearSelected();
          }}>🗑️ Delete selected</button>
          <button className="sp-btn" onClick={clearSelected}>✕ Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={selected.size === sorted.length && sorted.length > 0} onChange={toggleAll} />
                </th>
                {cols.map(col => (
                  <th
                    key={col.key}
                    draggable
                    onDragStart={e => handleColDragStart(e, col.key)}
                    onDragOver={e => handleColDragOver(e, col.key)}
                    onDrop={e => handleColDrop(e, col.key)}
                    onDragEnd={handleColDragEnd}
                    onClick={() => handleSort(col.key)}
                    style={{ cursor: "pointer", userSelect: "none", opacity: dragOverCol === col.key ? 0.4 : 1, whiteSpace: "nowrap" }}
                    title="Click to sort · Drag to reorder"
                  >
                    <span style={{ marginRight: 4, opacity: 0.35 }}>⠿</span>
                    {col.label}{sortArrow(col.key)}
                  </th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 2} style={{ textAlign: "center", padding: "40px 20px", color: "var(--sub)" }}>
                    {data.length === 0 ? "No tenants yet — add areas and units on the Site Plan to get started." : "No tenants match your filters."}
                  </td>
                </tr>
              )}
              {sorted.slice(0, 200).map((t, i) => (
                <tr key={i} style={{ background: selected.has(t.id) ? "#F0F6FF" : "" }}>
                  <td style={{ padding: "11px 14px" }}>
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} />
                  </td>
                  {cols.map(col => renderCell(t, col.key))}
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="sp-btn" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => onEdit(t)}>Edit</button>
                      <button className="sp-btn" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => onArchive(t.id)} title="Archive">📦</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "9px 16px", fontSize: 12, color: "var(--sub)", borderTop: "1px solid var(--border)" }}>
          {sorted.length} records · £{rev.toLocaleString()}/mo filtered revenue ·{" "}
          <span style={{ opacity: 0.6 }}>Click column headers to sort · Drag to reorder</span>
        </div>
      </div>
    </div>
  );
}

// ─── Onboarding Page ─────────────────────────────────────────────────────────
function OnboardingPage({ session, onComplete }) {
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState("");
  const [siteTypes, setSiteTypes] = useState([]);

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const userId = session?.user?.id;
  const token = session?.access_token;

  const SITE_TYPES = [
    { id: "storage",     icon: "🏭", label: "Self-storage",  sub: "Standard storage units" },
    { id: "residential", icon: "🏘️", label: "Residential",   sub: "Houses, flats, cottages" },
    { id: "commercial",  icon: "🏢", label: "Commercial",    sub: "Offices, workshops, units" },
  ];

  const steps = [
    { n: 1, label: "Your business" },
    { n: 2, label: "Site type" },
    { n: 3, label: "Ready" },
  ];

  async function handleStep1() {
    if (!orgName.trim()) { setErr("Please enter your business name"); return; }
    setErr(""); setStep(2);
  }

  async function handleStep2() {
    if (siteTypes.length === 0) { setErr("Please select at least one option"); return; }
    setErr(""); setStep(3);
  }

  async function handleFinish() {
    setErr(""); setLoading(true);
    try {
      const org = await createOrg(orgName.trim(), userId, token);
      onComplete(org);
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }

  return (
    <div className="onboard-page">
      <div className="onboard-card">
        <div className="onboard-logo">cerect<span>.</span></div>

        {/* Step indicator */}
        <div className="onboard-steps">
          {steps.map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className={`onboard-step-circle ${step > s.n ? "done" : step === s.n ? "active" : "pending"}`}>
                  {step > s.n ? "✓" : s.n}
                </div>
                <span className={`onboard-step-label ${step > s.n ? "done" : step === s.n ? "active" : ""}`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && <div className="onboard-step-line" />}
            </div>
          ))}
        </div>

        {/* Step 1 — Business name */}
        {step === 1 && (
          <>
            <div className="onboard-heading">Welcome to Cerect</div>
            <div className="onboard-sub">
              Let's get your site set up. This only takes a minute.
            </div>
            {err && <div className="onboard-err">{err}</div>}
            <div className="onboard-field">
              <label className="onboard-label">Business name</label>
              <input
                className="onboard-input"
                type="text"
                placeholder="e.g. Acme Storage Ltd"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleStep1()}
                autoFocus
              />
              <span className="onboard-hint">This is the name your team will see in Cerect.</span>
            </div>
            <button className="onboard-btn" onClick={handleStep1}>
              Continue →
            </button>
          </>
        )}

        {/* Step 2 — Site type */}
        {step === 2 && (
          <>
            <div className="onboard-heading">What does your site include?</div>
            <div className="onboard-sub">
              Select all that apply. You can manage each category separately once you're set up.
            </div>
            {err && <div className="onboard-err">{err}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              {SITE_TYPES.map(t => (
                <div
                  key={t.id}
                  className={`category-card ${siteTypes.includes(t.id) ? "selected" : ""}`}
                  onClick={() => setSiteTypes(prev =>
                    prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id]
                  )}
                >
                  <div className="category-card-icon">{t.icon}</div>
                  <div className="category-card-label">{t.label}</div>
                  <div className="category-card-sub">{t.sub}</div>
                </div>
              ))}
            </div>
            <button className="onboard-btn" onClick={handleStep2} disabled={siteTypes.length === 0}>
              Continue →
            </button>
            <button
              style={{ background: "none", border: "none", color: "var(--sub)", fontSize: 13, cursor: "pointer", marginTop: 12, display: "block", width: "100%", textAlign: "center" }}
              onClick={() => { setStep(1); setErr(""); }}
            >
              ← Back
            </button>
          </>
        )}

        {/* Step 3 — Confirm and create */}
        {step === 3 && (
          <>
            <div className="onboard-heading">You're all set</div>
            <div className="onboard-sub">
              We'll create your Cerect account now. You can add your areas and units right after.
            </div>
            {err && <div className="onboard-err">{err}</div>}

            <div style={{ background: "var(--mist)", borderRadius: "var(--r)", padding: "16px 18px", marginBottom: 20 }}>
              {[
                { label: "Business name", value: orgName },
                { label: "Site includes", value: siteTypes.map(id => SITE_TYPES.find(t => t.id === id)?.label).join(", ") },
                { label: "Plan", value: "Trial — 14 days free" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--sub)" }}>{r.label}</span>
                  <span style={{ fontWeight: 500 }}>{r.value}</span>
                </div>
              ))}
            </div>

            <button className="onboard-btn" onClick={handleFinish} disabled={loading}>
              {loading ? "Creating your account…" : "Launch Cerect →"}
            </button>
            <button
              style={{ background: "none", border: "none", color: "var(--sub)", fontSize: 13, cursor: "pointer", marginTop: 12, display: "block", width: "100%", textAlign: "center" }}
              onClick={() => { setStep(2); setErr(""); }}
            >
              ← Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────
function DashboardPage({ session, org, data = [] }) {
  const email = session?.user?.email || "";
  const orgName = org?.name || "Your site";

  const stor = data.filter(d => d.category === "Storage");
  const res = data.filter(d => d.category === "Residential");
  const com = data.filter(d => d.category === "Commercial");
  const activeStatuses = ["occupied", "arrears", "new"];
  const occ = stor.filter(u => activeStatuses.includes(u.status)).length;
  const totalRent = data.filter(u => u.rent && activeStatuses.includes(u.status)).reduce((a, b) => a + (Number(b.rent) || 0), 0);
  const occRate = stor.length > 0 ? Math.round(occ / stor.length * 100) : 0;

  return (
    <div className="page">
      <div className="mb-6">
        <h1 style={{ fontFamily: "var(--fh)", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 14, color: "var(--sub)" }}>
          {orgName}
        </p>
      </div>

      <div className="kpi-grid">
        {[
          { label: "Storage Units", value: stor.length || "—", meta: `${occ} occupied` },
          { label: "Occupancy Rate", value: stor.length ? `${occRate}%` : "—", meta: `${stor.length - occ} vacant` },
          { label: "Monthly Revenue", value: totalRent ? `£${totalRent.toLocaleString()}` : "—", meta: "All categories ex-VAT" },
          { label: "Properties", value: res.length + com.length || "—", meta: `${res.length} residential, ${com.length} commercial` },
        ].map(k => (
          <div className="kpi-card" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Getting started</div>
          <div className="card-sub">Complete these steps to set up your site</div>
          {[
            { step: 1, label: "Business set up", done: true },
            { step: 2, label: "Set up your site plan", done: stor.length > 0 },
            { step: 3, label: "Add your first tenant", done: data.some(u => u.tenant) },
            { step: 4, label: "Record a payment", done: false },
          ].map(s => (
            <div key={s.step} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: s.done ? "var(--success)" : "var(--mist)",
                border: s.done ? "none" : "1.5px solid var(--mist2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 600,
                color: s.done ? "#fff" : "var(--sub)",
                flexShrink: 0,
              }}>
                {s.done ? "✓" : s.step}
              </div>
              <span style={{ fontSize: 14, color: s.done ? "var(--sub)" : "var(--text)" }}>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">Your account</div>
          <div className="card-sub">Organisation details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "Organisation", value: orgName },
              { label: "Email", value: email },
              { label: "Plan", value: org?.plan === "trial" ? "Trial" : (org?.plan || "Trial") },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
                <span style={{ color: "var(--sub)" }}>{r.label}</span>
                <span style={{ fontWeight: 500 }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", section: null },
  { id: "siteplan",  label: "Site Plan",  icon: "siteplan",  section: "Manage" },
  { id: "tenants",   label: "Tenants",    icon: "tenants",   section: null },
  { id: "payments",  label: "Payments",   icon: "payments",  section: null },
  { id: "crm",       label: "Enquiries",  icon: "crm",       section: null },
  { id: "documents", label: "Documents",  icon: "documents", section: null },
  { id: "archive",   label: "Archive",    icon: "archive",   section: null },
  { id: "users",     label: "Users",      icon: "users",     section: "Admin" },
  { id: "settings",  label: "Settings",   icon: "settings",  section: null },
];

function Sidebar({ page, setPage, session, org, onSignOut, open, onClose }) {
  const email = session?.user?.email || "";
  const initials = email ? email.slice(0, 2).toUpperCase() : "??";
  let lastSection = null;

  return (
    <>
      <div className={`backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-logo">
          <div className="sidebar-wordmark">cerect<span>.</span></div>
          <div className="sidebar-tagline">{org?.name || "Storage Management"}</div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(item => {
            const showSection = item.section && item.section !== lastSection;
            if (item.section) lastSection = item.section;
            return (
              <div key={item.id}>
                {showSection && <div className="nav-section">{item.section}</div>}
                <button
                  className={`nav-item ${page === item.id ? "active" : ""}`}
                  onClick={() => { setPage(item.id); onClose(); }}
                >
                  <span className="nav-icon">{Icon[item.icon]}</span>
                  {item.label}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-chip">
            <div className="user-avatar">{initials}</div>
            <div className="user-email">{email}</div>
            <button className="signout-btn" onClick={onSignOut} title="Sign out">
              <span style={{ width: 16, height: 16, display: "block" }}>{Icon.signout}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [org, setOrg] = useState(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState([]);
  const [areas, setAreas] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const { toasts, toast } = useToast();
  const refreshRef = useRef(null);

  const token = session?.access_token;
  const orgId = org?.id;

  // Restore session
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cerect_session");
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.access_token) setSession(s);
      }
    } catch {}
  }, []);

  // Load org whenever session changes
  useEffect(() => {
    if (!session?.user?.id) return;
    setOrgLoading(true);
    getOrgForUser(session.user.id, session.access_token).then(async row => {
      if (row?.org_id) {
        const o = await getOrgDetails(row.org_id, session.access_token);
        setOrg(o);
        setNeedsOnboarding(false);
      } else {
        setNeedsOnboarding(true);
      }
      setOrgLoading(false);
    });
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load data whenever org is ready
  const loadData = useCallback(async () => {
    if (!token || !orgId) return;
    setDataLoading(true);
    try {
      const [rows, areaRows] = await Promise.all([dbGet(orgId, token), areasGet(orgId, token)]);
      setData(Array.isArray(rows) ? rows : []);
      if (Array.isArray(areaRows)) {
        setAreas(areaRows);
        // Auto-populate areas from existing tenants if areas table is empty
        if (areaRows.length === 0 && Array.isArray(rows) && rows.length > 0) {
          const storageRows = [...new Set(rows.filter(d => d.category === "Storage" && d.row_name).map(d => d.row_name))];
          for (let i = 0; i < storageRows.length; i++) {
            await areasUpsert(storageRows[i], "Storage", i, orgId, token);
          }
          const fresh = await areasGet(orgId, token);
          setAreas(fresh || []);
        }
      }
    } catch (e) {
      if (e?.message === "SESSION_EXPIRED") {
        toast("Your session has expired — please sign in again", "error");
        handleSignOut();
      }
    }
    setDataLoading(false);
  }, [token, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh session every 50 minutes
  useEffect(() => {
    if (!session) return;
    refreshRef.current = setInterval(async () => {
      const fresh = await refreshSession(session.refresh_token);
      if (fresh) {
        setSession(fresh);
        localStorage.setItem("cerect_session", JSON.stringify(fresh));
      } else {
        handleSignOut();
      }
    }, 50 * 60 * 1000);
    return () => clearInterval(refreshRef.current);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key closes modal
  useEffect(() => {
    const handler = e => { if (e.key === "Escape" && editItem) setEditItem(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editItem]);

  function handleLogin(s) {
    setSession(s);
    localStorage.setItem("cerect_session", JSON.stringify(s));
    toast("Signed in successfully", "success");
  }

  async function handleSignOut() {
    if (session?.access_token) {
      try { await signOut(session.access_token); } catch {}
    }
    setSession(null);
    setOrg(null);
    setData([]);
    setAreas([]);
    setNeedsOnboarding(false);
    localStorage.removeItem("cerect_session");
    setPage("dashboard");
  }

  function handleOnboardingComplete(newOrg) {
    setOrg(newOrg);
    setNeedsOnboarding(false);
    toast("Welcome to Cerect! Your account is ready.", "success");
  }

  async function handleArchive(id) {
    try {
      const unit = data.find(u => u.id === id);
      if (!unit) return;
      // Save to archived_tenants
      await fetch(`${SUPABASE_URL}/rest/v1/archived_tenants`, {
        method: "POST",
        headers: { ...authH(token), Prefer: "return=minimal" },
        body: JSON.stringify({ org_id: orgId, original_unit_id: String(id), tenant_data: unit }),
      });
      // Clear tenant from unit but keep the unit
      await dbUpsert({
        ...unit,
        org_id: orgId,
        tenant: null, email: null, phone: null, address: null,
        payment: null, rent: null, vat_rent: null,
        status: "available", move_in_date: null, move_out_date: null,
        lock_deposit_paid: null, lock_deposit_amount: null,
        tenant_deposit: null, key_number: null, notes: null, review: null,
      }, token);
      const fresh = await dbGet(orgId, token);
      setData(Array.isArray(fresh) ? fresh : []);
      toast("Tenant archived", "success");
    } catch { toast("Archive failed", "error"); }
  }

  // ── Site Plan handlers ────────────────────────────────────────────────────
  async function handleSave(form) {
    try {
      const row = { ...form, org_id: orgId };
      await dbUpsert(row, token);
      const fresh = await dbGet(orgId, token);
      setData(Array.isArray(fresh) ? fresh : []);
      toast("Saved", "success");
    } catch { toast("Save failed", "error"); }
  }

  async function handleDelete(id) {
    try {
      await dbDelete(id, orgId, token);
      setData(d => d.filter(u => u.id !== id));
      toast("Unit deleted", "success");
    } catch { toast("Delete failed", "error"); }
  }

  async function handleAddUnit(unit) {
    try {
      const row = { ...unit, org_id: orgId };
      await dbUpsert(row, token);
      setData(d => [...d, row]);
      if (unit.row_name) {
        const exists = areas.some(a => a.name === unit.row_name);
        if (!exists) {
          await areasUpsert(unit.row_name, "Storage", areas.length, orgId, token);
          const fresh = await areasGet(orgId, token);
          setAreas(fresh || []);
        }
      }
      toast("Unit added", "success");
    } catch { toast("Could not add unit — check the ID is unique", "error"); }
  }

  async function handleRenameRow(oldName, newName) {
    try {
      const units = data.filter(u => u.row_name === oldName);
      for (const u of units) { await dbUpsert({ ...u, row_name: newName, org_id: orgId }, token); }
      setData(d => d.map(u => u.row_name === oldName ? { ...u, row_name: newName } : u));
      const area = areas.find(a => a.name === oldName);
      if (area) {
        await areasDelete(oldName, orgId, token);
        await areasUpsert(newName, "Storage", area.sort_order, orgId, token);
        const fresh = await areasGet(orgId, token);
        setAreas(fresh || []);
      }
      toast(`Renamed "${oldName}" to "${newName}"`, "success");
    } catch { toast("Rename failed", "error"); }
  }

  async function handleDeleteRow(rowName) {
    try {
      const units = data.filter(u => u.row_name === rowName);
      for (const u of units) { await dbDelete(u.id, orgId, token); }
      setData(d => d.filter(u => u.row_name !== rowName));
      await areasDelete(rowName, orgId, token);
      const fresh = await areasGet(orgId, token);
      setAreas(fresh || []);
      toast(`Deleted area "${rowName}"`, "success");
    } catch { toast("Delete failed", "error"); }
  }

  async function handleSaveAreaOrder(names) {
    try {
      await areasUpdateOrder(names, orgId, token);
      const fresh = await areasGet(orgId, token);
      setAreas(fresh || []);
    } catch { toast("Could not reorder areas", "error"); }
  }

  async function handleAddArea(name) {
    try {
      await areasUpsert(name, "Storage", areas.length, orgId, token);
      const fresh = await areasGet(orgId, token);
      setAreas(fresh || []);
      toast(`Area "${name}" created`, "success");
    } catch { toast("Could not create area", "error"); }
  }

  async function handleSaveUnitOrder(updates) {
    try {
      for (const u of updates) {
        await dbUpsert({ ...data.find(d => d.id === u.id), ...u, org_id: orgId }, token);
      }
      const fresh = await dbGet(orgId, token);
      setData(Array.isArray(fresh) ? fresh : []);
    } catch { toast("Could not reorder units", "error"); }
  }

  const pageTitle = NAV.find(n => n.id === page)?.label || "Dashboard";

  function renderPage() {
    switch (page) {
      case "dashboard": return <DashboardPage session={session} org={org} data={data} />;
      case "tenants": return (
        <TenantsPage
          data={data}
          onEdit={r => { setEditItem(r); setIsNew(false); }}
          onAdd={() => { setEditItem({ id: "", label: "", tenant: "", email: "", phone: "", payment: "Monthly DD", rent: null, vat_rent: null, status: "occupied", category: "Residential", row_name: null, box_no: null, size: null, review: "", notes: "", address: "" }); setIsNew(true); }}
          onArchive={handleArchive}
          setPage={setPage}
        />
      );
        <SitePlanPage
          data={data}
          areas={areas}
          onEdit={r => { setEditItem(r); setIsNew(false); }}
          onAdd={handleAddUnit}
          onDelete={handleDelete}
          onRenameRow={handleRenameRow}
          onDeleteRow={handleDeleteRow}
          onSaveAreaOrder={handleSaveAreaOrder}
          onAddArea={handleAddArea}
          onSaveUnitOrder={handleSaveUnitOrder}
        />
      );
      default: return (
        <div className="page">
          <ComingSoon title={pageTitle} />
        </div>
      );
    }
  }

  if (!session) return <LoginPage onLogin={handleLogin} />;

  if (orgLoading) return (
    <div style={{ minHeight: "100vh", background: "var(--mist)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "var(--sub)", fontSize: 14 }}>
        <div style={{ fontFamily: "var(--fh)", fontSize: 20, fontWeight: 700, color: "var(--navy)", marginBottom: 8 }}>cerect<span style={{ color: "var(--gold)" }}>.</span></div>
        Loading your account…
      </div>
    </div>
  );

  if (needsOnboarding) return (
    <OnboardingPage session={session} onComplete={handleOnboardingComplete} />
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <Sidebar
          page={page}
          setPage={setPage}
          session={session}
          org={org}
          onSignOut={handleSignOut}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="main">
          <div className="topbar">
            <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}>
              <span style={{ width: 20, height: 20, display: "block" }}>{Icon.menu}</span>
            </button>
            <div className="topbar-title">{pageTitle}</div>
            <div className="topbar-org">{org?.name || "Trial"}</div>
          </div>
          {dataLoading && page === "siteplan" ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--sub)" }}>Loading site plan…</div>
          ) : renderPage()}
        </div>
      </div>

      {/* Edit Modal */}
      {editItem && (
        <EditModal
          item={editItem}
          isNew={isNew}
          areas={areas}
          existingIds={data}
          onClose={() => setEditItem(null)}
          onSave={async form => { await handleSave(form); }}
          onDelete={async id => { await handleDelete(id); setEditItem(null); }}
          onArchive={id => { handleArchive(id); setEditItem(null); }}
        />
      )}

      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </>
  );
}
