// Cerect v0.1 — Storage Management Platform
// https://cerect.com

import { useState, useEffect, useCallback, useRef } from "react";

const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_KEY = "YOUR_SUPABASE_ANON_KEY";
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

function authH(token) {
  return { ...BASE_H, Authorization: `Bearer ${token}` };
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
.onboard-wrap {
  max-width: 560px;
  margin: 0 auto;
  padding: 48px 24px;
}

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

/* ── Util ─────────────────────────────────────────────────────────────────── */
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
        setSessionData(data);
        setStage("mfa-enroll");
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
                  <img src={sessionData.qr} alt="QR code" style={{ width: 180, height: 180, border: "1px solid var(--border)", borderRadius: 8 }} />
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

// ─── Dashboard Page ───────────────────────────────────────────────────────
function DashboardPage({ session }) {
  const email = session?.user?.email || "";

  return (
    <div className="page">
      <div className="mb-6">
        <h1 style={{ fontFamily: "var(--fh)", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          Welcome to Cerect
        </h1>
        <p style={{ fontSize: 14, color: "var(--sub)" }}>
          Your storage management platform is ready. Start by setting up your site.
        </p>
      </div>

      <div className="kpi-grid">
        {[
          { label: "Total units", value: "—", meta: "Set up your site plan" },
          { label: "Occupied", value: "—", meta: "Add tenants to begin" },
          { label: "Occupancy rate", value: "—%", meta: "Based on active units" },
          { label: "Monthly revenue", value: "—", meta: "From payment records" },
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
            { step: 1, label: "Set up your site plan", done: false },
            { step: 2, label: "Add your first area", done: false },
            { step: 3, label: "Add your first tenant", done: false },
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
              { label: "Email", value: email },
              { label: "Plan", value: "Trial" },
              { label: "MFA", value: "Enabled ✓" },
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

function Sidebar({ page, setPage, session, onSignOut, open, onClose }) {
  const email = session?.user?.email || "";
  const initials = email ? email.slice(0, 2).toUpperCase() : "??";
  let lastSection = null;

  return (
    <>
      <div className={`backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-logo">
          <div className="sidebar-wordmark">cerect<span>.</span></div>
          <div className="sidebar-tagline">Storage Management</div>
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
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toasts, toast } = useToast();
  const refreshRef = useRef(null);

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
  }, [session]);

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
    localStorage.removeItem("cerect_session");
    setPage("dashboard");
  }

  const pageTitle = NAV.find(n => n.id === page)?.label || "Dashboard";

  function renderPage() {
    switch (page) {
      case "dashboard": return <DashboardPage session={session} />;
      default: return (
        <div className="page">
          <ComingSoon title={pageTitle} />
        </div>
      );
    }
  }

  if (!session) return <LoginPage onLogin={handleLogin} />;

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <Sidebar
          page={page}
          setPage={setPage}
          session={session}
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
            <div className="topbar-org">Trial</div>
          </div>
          {renderPage()}
        </div>
      </div>
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </>
  );
}
