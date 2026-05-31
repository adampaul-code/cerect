import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

// Cerect v2.1 — Multi-tenant Storage Management Platform
const SUPABASE_URL = "https://lbealsgloqoepazfrgbj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiZWFsc2dsb3FvZXBhemZyZ2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MzE4OTEsImV4cCI6MjA5NTEwNzg5MX0.r8bWBOmqQy9VDcyk6mCxxfK1bORFYBs1lHTVMRvETEY";
const BASE_H = { "Content-Type": "application/json", apikey: SUPABASE_KEY };
// eslint-disable-next-line no-unused-vars
const SUPER_ADMIN_EMAIL = (process.env.REACT_APP_SUPER_ADMIN_EMAIL || "").toLowerCase();

async function checkSuperAdmin(email, token) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/super_admins?email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`,
    { headers: authH(token) }
  );
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}
const AUTH_H = (token) => ({ "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` });

async function adminCall(action, params={}) {
  const r = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...params })
  });
  return r.json();
}

async function sendInviteEmail(toEmail, tempPassword) {
  const r = await fetch("/api/send-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: toEmail, tempPassword })
  });
  const d = await r.json();
  return d;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
async function resetPassword(email) {
  const d = await adminCall("resetPassword", { email });
  if (d.error) throw new Error(d.error);
  // Send email with temp password via Resend
  const emailR = await fetch("/api/send-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: email, tempPassword: d.tempPass })
  });
  return emailR.ok;
}

async function changePassword(newPassword, token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: { ...BASE_H, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password: newPassword })
  });
  return r.ok;
}

async function signIn(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { ...BASE_H },
    body: JSON.stringify({ email, password })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.msg || "Login failed");
  return data;
}

async function signOut(token) {
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: "POST", headers: { ...BASE_H, Authorization: `Bearer ${token}` }
  });
}

async function refreshSession(refreshToken) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { ...BASE_H },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  if (!r.ok) return null;
  return r.json();
}

// eslint-disable-next-line no-unused-vars
async function getUser(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { ...BASE_H, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  return r.json();
}

async function listUsers() {
  const d = await adminCall("listUsers");
  return d.users || [];
}

// ─── MFA helpers ──────────────────────────────────────────────────────────────
async function mfaEnroll(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/factors`, {
    method: "POST",
    headers: { ...BASE_H, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ friendly_name: "Cerect", factor_type: "totp" })
  });
  return r.json();
}

async function mfaChallenge(factorId, token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}/challenge`, {
    method: "POST",
    headers: { ...BASE_H, Authorization: `Bearer ${token}` }
  });
  return r.json();
}

async function mfaVerify(factorId, challengeId, code, token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}/verify`, {
    method: "POST",
    headers: { ...BASE_H, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ challenge_id: challengeId, code })
  });
  return r.json();
}

async function mfaListFactors(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { ...BASE_H, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return [];
  const d = await r.json();
  return d.factors || [];
}

async function mfaUnenroll(factorId, token) {
  await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}`, {
    method: "DELETE",
    headers: { ...BASE_H, Authorization: `Bearer ${token}` }
  });
}

async function deleteUser(userId) {
  await adminCall("deleteUser", { userId });
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
function authH(token) {
  return { ...BASE_H, Authorization: `Bearer ${token}` };
}

// ─── Org helpers (multi-tenant) ───────────────────────────────────────────────
async function auditLog(token, orgId, userEmail, action, entityType, entityId, entityLabel, details={}) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/audit_log`, {
      method: "POST",
      headers: { ...authH(token), Prefer: "return=minimal" },
      body: JSON.stringify({
        org_id: orgId,
        user_email: userEmail,
        action,
        entity_type: entityType,
        entity_id: String(entityId || ""),
        entity_label: entityLabel || "",
        details,
      }),
    });
  } catch {} // Never let audit logging crash the app
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
  if (!r.ok) throw new Error(`Database error (${r.status}): ${text}`);
  let org = null;
  try { const arr = JSON.parse(text); org = Array.isArray(arr) ? arr[0] : arr; } catch {}
  if (!org?.id) throw new Error("Organisation created but ID not returned");
  await fetch(`${SUPABASE_URL}/rest/v1/org_users`, {
    method: "POST",
    headers: { ...authH(token), Prefer: "return=minimal" },
    body: JSON.stringify({ org_id: org.id, user_id: userId, role: "admin" }),
  });
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


const DOC_TAGS = ["Contract","ID / Passport","Correspondence","Payment Record","Insurance","Reference","Photo","Other"];

async function saveDocTag(filePath, tenantId, tag, originalName, token, orgId) {
  await fetch(`${SUPABASE_URL}/rest/v1/document_tags`, {
    method: "POST",
    headers: { ...authH(token), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ file_path: filePath, tenant_id: tenantId, tag, original_name: originalName, org_id: orgId })
  });
}
async function getDocTags(tenantId, token, orgId) {
  const safeId = (tenantId||"").replace(/\s+/g,'').replace(/[^a-zA-Z0-9._-]/g, '_');
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/document_tags?org_id=eq.${orgId}&file_path=like.${encodeURIComponent(safeId + '/%')}`,
    { headers: authH(token) }
  );
  return r.ok ? r.json() : [];
}

async function getAllDocTags(token, orgId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/document_tags?org_id=eq.${orgId}&order=id.desc`, { headers: authH(token) });
  return r.ok ? r.json() : [];
}
async function deleteDocTag(filePath, token) {
  await fetch(`${SUPABASE_URL}/rest/v1/document_tags?file_path=eq.${encodeURIComponent(filePath)}`, {
    method: "DELETE", headers: authH(token)
  });
}
async function updateDocTag(filePath, tag, token) {
  // Fetch the record id first
  const getR = await fetch(`${SUPABASE_URL}/rest/v1/document_tags?file_path=eq.${encodeURIComponent(filePath)}&select=id`, {
    headers: AUTH_H(token)
  });
  const rows = await getR.json();
  if (Array.isArray(rows) && rows[0]?.id) {
    // Update by id — much more reliable than filtering by file_path
    await fetch(`${SUPABASE_URL}/rest/v1/document_tags?id=eq.${rows[0].id}`, {
      method: "PATCH",
      headers: { ...AUTH_H(token), Prefer: "return=minimal" },
      body: JSON.stringify({ tag })
    });
  } else {
    // No record exists — insert
    await fetch(`${SUPABASE_URL}/rest/v1/document_tags`, {
      method: "POST",
      headers: { ...AUTH_H(token), Prefer: "return=minimal" },
      body: JSON.stringify({ file_path: filePath, tag })
    });
  }
}

async function uploadDocument(file, tenantId, token) {
  const safeId = (tenantId||"").replace(/\s+/g,'').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${safeId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": file.type||"application/octet-stream", "x-upsert": "true" },
    body: file
  });
  if (!r.ok) throw new Error("Upload failed");
  return path;
}

async function listDocuments(tenantId, token) {
  // Only sanitise individual path segments, preserve slashes
  const safePath = tenantId.split('/').map(seg => seg.replace(/\s+/g,'').replace(/[^a-zA-Z0-9._-]/g,'_')).join('/');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/documents`, {
    method: "POST",
    headers: { ...BASE_H, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ prefix: safePath + "/", limit: 100, sortBy: { column: "created_at", order: "desc" } })
  });
  if (!r.ok) return [];
  return r.json();
}

async function deleteDocument(path, token) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${path}`, {
    method: "DELETE",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
  });
  return r.ok;
}

async function getSignedUrl(path, token) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/documents/${path}`, {
    method: "POST",
    headers: { ...BASE_H, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expiresIn: 3600 })
  });
  const d = await r.json();
  return d.signedURL ? `${SUPABASE_URL}/storage/v1${d.signedURL}` : null;
}

function fileIcon(name) {
  const ext = (name.split('.').pop()||'').toLowerCase();
  if(['pdf'].includes(ext)) return '📄';
  if(['doc','docx'].includes(ext)) return '📝';
  if(['xls','xlsx','csv'].includes(ext)) return '📊';
  if(['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼️';
  if(['zip','rar','7z'].includes(ext)) return '📦';
  return '📎';
}

function formatBytes(bytes) {
  if(!bytes) return '';
  if(bytes < 1024) return bytes + ' B';
  if(bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1048576).toFixed(1) + ' MB';
}

async function areasGet(token, orgId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/areas?org_id=eq.${orgId}&order=sort_order,name`, { headers: authH(token) });
  return r.json();
}
async function areasUpsert(name, category, sortOrder, token, orgId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/areas`, {
    method: "POST",
    headers: { ...authH(token), Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ name, category, sort_order: sortOrder, org_id: orgId })
  });
  return r.json();
}
async function areasDelete(name, token, orgId) {
  await fetch(`${SUPABASE_URL}/rest/v1/areas?name=eq.${encodeURIComponent(name)}&org_id=eq.${orgId}`, {
    method: "DELETE", headers: authH(token)
  });
}
async function areasUpdateOrder(names, token, orgId) {
  for(let i=0; i<names.length; i++){
    await fetch(`${SUPABASE_URL}/rest/v1/areas?name=eq.${encodeURIComponent(names[i])}&org_id=eq.${orgId}`, {
      method: "PATCH",
      headers: { ...authH(token), Prefer: "return=minimal" },
      body: JSON.stringify({ sort_order: i })
    });
  }
}

// ─── Enquiry helpers ─────────────────────────────────────────────────────────
async function enquiryList(token, orgId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/enquiries?org_id=eq.${orgId}&order=enquiry_date.desc`, { headers: authH(token) });
  return r.ok ? r.json() : [];
}
async function enquirySave(data, token, orgId) {
  const clean={...data, org_id: orgId, updated_at: new Date().toISOString()};
  if(!clean.follow_up_date) clean.follow_up_date=null;
  if(!clean.enquiry_date) clean.enquiry_date=null;
  if(!clean.email) clean.email=null;
  if(!clean.phone) clean.phone=null;
  if(!clean.size_needed) clean.size_needed=null;
  if(!clean.notes) clean.notes=null;
  if(!clean.earmarked_unit) clean.earmarked_unit=null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/enquiries`, {
    method: "POST",
    headers: { ...authH(token), Prefer: "return=representation" },
    body: JSON.stringify(clean)
  });
  return r.ok ? r.json() : null;
}
async function enquiryUpdate(id, data, token) {
  const clean={...data, updated_at: new Date().toISOString()};
  if(clean.follow_up_date==="") clean.follow_up_date=null;
  if(clean.enquiry_date==="") clean.enquiry_date=null;
  await fetch(`${SUPABASE_URL}/rest/v1/enquiries?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...authH(token), Prefer: "return=minimal" },
    body: JSON.stringify(clean)
  });
}
async function enquiryDelete(id, token) {
  await fetch(`${SUPABASE_URL}/rest/v1/enquiries?id=eq.${id}`, {
    method: "DELETE", headers: authH(token)
  });
}

// ─── Archived tenants helpers ────────────────────────────────────────────────
async function archiveSave(unitId, tenantData, token, orgId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/archived_tenants`, {
    method: "POST",
    headers: { ...authH(token), Prefer: "return=representation" },
    body: JSON.stringify({ 
      org_id: orgId,
      original_unit_id: String(unitId), 
      tenant_data: JSON.parse(JSON.stringify(tenantData, (key, val) => val === undefined ? null : val))
    })
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { error: text }; }
}
async function archiveList(token, orgId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/archived_tenants?org_id=eq.${orgId}&order=archived_at.desc`, { headers: authH(token) });
  return r.json();
}
async function archiveDelete(id, token) {
  await fetch(`${SUPABASE_URL}/rest/v1/archived_tenants?id=eq.${id}`, { method: "DELETE", headers: authH(token) });
}

async function dbGet(token, orgId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tenants?org_id=eq.${orgId}&order=category,id&deleted_at=is.null`, { headers: authH(token) });
  if(r.status===401) throw new Error("SESSION_EXPIRED");
  return r.json();
}
async function dbGetDeleted(token, orgId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tenants?org_id=eq.${orgId}&deleted_at=not.is.null&archived=eq.false&order=deleted_at.desc`, { headers: authH(token) });
  return r.json();
}
async function dbUpsert(row, token) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tenants`, {
    method: "POST",
    headers: { ...authH(token), Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row)
  });
  return r.json();
}
async function dbDelete(id, token, orgId) {
  await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(id)}&org_id=eq.${orgId}`, {
    method: "DELETE", headers: authH(token)
  });
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const PC={occupied:"p-occ",arrears:"p-arr",leaving:"p-lea",new:"p-new",pending:"p-pen",available:"p-avl"};
const UC={occupied:"uc-occ",arrears:"uc-arr",leaving:"uc-lea",new:"uc-new",pending:"uc-pen",available:"uc-avl"};
const DC={occupied:"d-occ",arrears:"d-arr",leaving:"d-lea",new:"d-new",pending:"d-pen",available:"d-avl"};
const SL={occupied:"Occupied",arrears:"In Arrears",leaving:"Leaving",new:"New Customer",pending:"Pending",available:"Available"};
const STATUSES=["occupied","arrears","leaving","new","pending","available"];
const PAYMENTS=["Monthly DD","Stripe","SO","Pays Manually","DD","—","Other"];

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#1A4F72;--gold:#C9A84C;--gold2:#E8C472;--white:#fff;--mist:#EEF2F7;
  --text:#0B1E3D;--sub:#5A6E8A;--success:#1A7F5A;--danger:#C0392B;
  --fh:'Syne',sans-serif;--fb:'DM Sans',sans-serif;
  --r:10px;--sh:0 4px 24px rgba(11,30,61,.10);--shl:0 12px 48px rgba(11,30,61,.16)
}
body{font-family:var(--fb);background:var(--mist);color:var(--text)}

/* ── Login ── */
.login-page{min-height:100vh;background:var(--navy);display:flex;align-items:center;justify-content:center;padding:20px}
.login-box{background:#fff;border-radius:16px;padding:40px;width:100%;max-width:420px;box-shadow:var(--shl)}
.login-logo{display:flex;align-items:center;gap:12px;margin-bottom:28px;justify-content:center}
.login-logotext{font-family:'Georgia',serif;font-size:24px;font-weight:700;color:var(--navy)}
.login-sub{text-align:center;color:var(--sub);font-size:13px;margin-bottom:24px;margin-top:-16px}
.login-field{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
.login-field label{font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;letter-spacing:.5px}
.login-field input{font-family:var(--fb);font-size:14px;padding:10px 13px;border:1.5px solid #D0DAE8;border-radius:8px;outline:none;width:100%}
.login-field input:focus{border-color:var(--navy)}
.login-btn{width:100%;background:var(--navy);color:#fff;font-family:var(--fb);font-size:14px;font-weight:600;padding:11px;border:none;border-radius:8px;cursor:pointer;margin-top:6px;transition:background .15s}
.login-btn:hover{background:#123a54}
.login-btn:disabled{opacity:.6;cursor:not-allowed}
.login-err{background:#FFF0EE;border:1px solid #FFCDD2;border-radius:7px;padding:10px 13px;font-size:13px;color:var(--danger);margin-bottom:12px}
.login-mfa{background:#EEF8FF;border:1px solid #BDE0F5;border-radius:8px;padding:14px;margin-bottom:14px;font-size:13px;color:var(--navy);text-align:center}

/* ── App shell ── */
.app{display:flex;min-height:100vh}
.sidebar{width:240px;min-height:100vh;background:var(--navy);display:flex;flex-direction:column;position:fixed;top:0;left:0;z-index:100;transition:transform 0.25s ease}
.logo-wrap{padding:18px 16px 16px;border-bottom:1px solid rgba(255,255,255,.12);flex-shrink:0}
.logo-row{display:flex;align-items:center;gap:10px}
.logo-shield{width:36px;height:36px;flex-shrink:0}
.logo-mark{font-family:'Georgia',serif;font-size:19px;font-weight:700;color:#fff;white-space:nowrap;line-height:1.2}
.logo-sub{font-size:9px;color:rgba(255,255,255,.45);letter-spacing:1.5px;text-transform:uppercase;margin-top:4px;padding-left:46px}
.snav{flex:1;padding:14px 10px;display:flex;flex-direction:column;gap:2px;overflow-y:auto}
.ns{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.3);padding:10px 10px 5px}
.ni{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:7px;color:rgba(255,255,255,.6);font-size:13px;font-weight:500;cursor:pointer;border:none;background:transparent;width:100%;text-align:left;transition:all .15s}
.ni:hover{background:rgba(201,168,76,.12);color:var(--gold2)}
.ni.active{background:rgba(201,168,76,.18);color:var(--gold);font-weight:600}
.nicon{font-size:15px;width:18px;text-align:center}
.sfooter{padding:14px 16px;border-top:1px solid rgba(201,168,76,.12)}
.urow{display:flex;align-items:center;gap:9px}
.uav{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--gold2));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:var(--navy);flex-shrink:0}
.uname{font-size:12px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px}
.urole{font-size:10px;color:rgba(255,255,255,.4)}
.signout-btn{background:none;border:none;color:rgba(255,255,255,.4);font-size:11px;cursor:pointer;padding:0;margin-top:2px;text-align:left}
.signout-btn:hover{color:rgba(255,255,255,.8)}
.main{margin-left:240px;flex:1;display:flex;flex-direction:column}
.topbar{background:#fff;border-bottom:1px solid #E4EAF2;padding:0 28px;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
.topbar-title{font-family:var(--fh);font-size:18px;font-weight:700;color:var(--navy)}
.hamburger{display:none;background:none;border:none;cursor:pointer;padding:8px;color:var(--navy);font-size:22px;line-height:1}
.sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99}
.tag{font-size:11px;background:var(--mist);border:1px solid #D8E2EE;border-radius:20px;padding:3px 10px;color:var(--sub);font-weight:500}
.content{padding:28px;flex:1}
@media(max-width:768px){
.sidebar{transform:translateX(-240px)}
.sidebar.mobile-open{transform:translateX(0)}
.sidebar-overlay.active{display:block}
.main{margin-left:0}
.hamburger{display:flex;align-items:center;justify-content:center}
.content{padding:14px}
.topbar{padding:0 14px;height:54px}
.topbar-title{font-size:15px}
.kg{grid-template-columns:1fr 1fr!important;gap:10px}
.kv{font-size:22px}
.g2{grid-template-columns:1fr!important}
.fg{grid-template-columns:1fr!important}
.fgi.full{grid-column:span 1!important}
.modal{width:98vw!important;max-width:98vw!important;margin:4px auto}
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
.btn{padding:9px 14px;font-size:13px;min-height:40px}
.btn-sm{padding:7px 11px;font-size:12px;min-height:36px}
.add-row-grid{grid-template-columns:1fr!important}
.ug{grid-template-columns:repeat(auto-fill,minmax(85px,1fr))!important}
.dpanel{padding:12px}
.dgrid{grid-template-columns:1fr 1fr!important}
.sin{font-size:16px}
.invite-box{padding:14px}
.card{border-radius:10px}
}

/* ── Cards ── */
.card{background:#fff;border-radius:var(--r);box-shadow:var(--sh);border:1px solid #E4EAF2;margin-bottom:18px}
.ch{padding:18px 22px 0;display:flex;align-items:center;justify-content:space-between}
.ct{font-family:var(--fh);font-size:14px;font-weight:700;color:var(--navy)}
.cb{padding:18px 22px 22px}
.kg{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.kc{background:#fff;border-radius:var(--r);padding:20px 22px;border:1px solid #E4EAF2;box-shadow:var(--sh);position:relative;overflow:hidden}
.kc::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--gold),var(--gold2))}
.kl{font-size:12px;text-transform:uppercase;letter-spacing:0.8px;color:var(--sub);font-weight:600;margin-bottom:8px}
.kv{font-family:var(--fb);font-size:30px;font-weight:700;color:var(--navy);line-height:1;letter-spacing:-0.5px}
.ks{font-size:12px;margin-top:7px;color:var(--sub);font-weight:500}
.ki{position:absolute;top:16px;right:16px;font-size:20px;opacity:.12}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;margin-bottom:18px}
.sp2{grid-column:span 2}

/* ── Table ── */
table{width:100%;border-collapse:collapse}
th{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--sub);font-weight:600;padding:9px 13px;text-align:left;background:var(--mist);border-bottom:1px solid #E4EAF2;white-space:nowrap}
td{padding:10px 13px;font-size:13px;border-bottom:1px solid #F0F4FA;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:#FAFCFF}
.tw{overflow-x:auto}

/* ── Pills ── */
.pill{display:inline-flex;align-items:center;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap}
.p-occ{background:#EBF5F0;color:#1A7F5A}.p-arr{background:#FFF3E0;color:#E65100}
.p-lea{background:#FFF0EE;color:#C0392B}.p-new{background:#FFFDE7;color:#7B6000}
.p-pen{background:#F3E5F5;color:#7B1FA2}.p-avl{background:#E3F2FD;color:#1565C0}

/* ── Buttons ── */
.btn{display:inline-flex;align-items:center;gap:6px;font-family:var(--fb);font-size:13px;font-weight:600;padding:7px 14px;border-radius:7px;border:none;cursor:pointer;transition:all .15s}
.btn-primary{background:var(--gold);color:var(--navy)}.btn-primary:hover{background:var(--gold2)}
.btn-outline{background:transparent;color:var(--navy);border:1.5px solid #D0DAE8}.btn-outline:hover{border-color:var(--gold);color:var(--gold)}
.btn-sm{font-size:12px;padding:5px 11px}
.btn-navy{background:var(--navy);color:#fff}.btn-navy:hover{background:#123a54}
.btn-danger{background:#FFF0EE;color:var(--danger);border:1.5px solid #FFCDD2}
.btn-success{background:#EBF5F0;color:var(--success);border:1.5px solid #BDE5D3}
.chip{display:inline-flex;background:var(--mist);border:1px solid #D8E2EE;border-radius:5px;font-size:11px;padding:2px 7px;color:var(--sub);font-weight:500}
.fr{display:flex;align-items:center;gap:8px}
.fb{display:flex;align-items:center;justify-content:space-between}
.mb16{margin-bottom:16px}.mb20{margin-bottom:20px}
.tsub{color:var(--sub)}.tsm{font-size:12px}

/* ── Site plan ── */
.ug{display:flex;flex-wrap:wrap;gap:7px}
.uc{border-radius:7px;padding:8px 11px;min-width:100px;cursor:pointer;border:2px solid transparent;transition:all .17s;position:relative}
.uc:hover{transform:translateY(-2px);box-shadow:var(--sh)}
.uc.sel{outline:2px solid var(--gold);outline-offset:2px}
.uc-occ{background:#EBF5F0;border-color:#BDE5D3}.uc-arr{background:#FFF3E0;border-color:#FFCC80}
.uc-lea{background:#FFF0EE;border-color:#FFCDD2}.uc-new{background:#FFFDE7;border-color:#FFF176}
.uc-pen{background:#F3E5F5;border-color:#CE93D8}.uc-avl{background:#E3F2FD;border-color:#90CAF9}
.uid{font-family:var(--fh);font-size:12px;font-weight:700;color:var(--navy)}
.uten{font-size:10px;color:var(--sub);margin-top:2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:110px}
.uprice{font-size:10px;font-weight:600;color:var(--navy);margin-top:2px}
.udot{width:6px;height:6px;border-radius:50%;position:absolute;top:7px;right:7px}
.d-occ{background:#1A7F5A}.d-arr{background:#E65100}.d-lea{background:#C0392B}
.d-new{background:#F9A825}.d-pen{background:#AB47BC}.d-avl{background:#1565C0}
.slabel{font-family:var(--fh);font-size:11px;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;margin-top:18px;padding:4px 9px;background:var(--mist);border-radius:5px;display:inline-block}
.legend{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.li{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--sub)}
.ld{width:9px;height:9px;border-radius:3px}
.dpanel{background:#fff;border:1px solid #E4EAF2;border-radius:var(--r);padding:18px 22px;margin-top:14px;box-shadow:var(--sh)}
.dgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.dlabel{font-size:10px;color:var(--sub);font-weight:600;text-transform:uppercase}
.dval{font-size:13px;font-weight:600;color:var(--navy);margin-top:2px;word-break:break-all}

/* ── Add row form ── */
.add-row-form{background:#F8FAFC;border:1.5px dashed #C9D8E8;border-radius:10px;padding:18px 20px;margin-top:18px}
.add-row-title{font-family:var(--fh);font-size:13px;font-weight:700;color:var(--navy);margin-bottom:14px}
.add-row-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.arf{display:flex;flex-direction:column;gap:4px}
.arf label{font-size:10px;font-weight:600;color:var(--sub);text-transform:uppercase}
.arf input,.arf select{font-family:var(--fb);font-size:13px;padding:7px 10px;border:1.5px solid #D0DAE8;border-radius:6px;outline:none;width:100%}
.arf input:focus,.arf select:focus{border-color:var(--navy)}

/* ── Misc ── */
.sin{font-family:var(--fb);font-size:13px;padding:7px 12px;border:1.5px solid #D0DAE8;border-radius:7px;outline:none}
.sin:focus{border-color:var(--gold)}
.sinw{width:260px}
.pb{height:6px;background:#E4EAF2;border-radius:99px;overflow:hidden}
.pbf{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gold),var(--gold2))}
.divider{height:1px;background:#E4EAF2;margin:14px 0}
.al-o{padding:10px 14px;background:#FFF3E0;border:1.5px solid #FFCC80;border-radius:8px;font-size:13px;margin-bottom:8px}
.al-r{padding:10px 14px;background:#FFF0EE;border:1.5px solid #FFCDD2;border-radius:8px;font-size:13px;margin-bottom:8px}

/* ── Modal ── */
.modal-ov{position:fixed;inset:0;background:rgba(11,30,61,.55);z-index:200;display:flex;align-items:center;justify-content:center;animation:fi .15s}
.modal{background:#fff;border-radius:14px;width:560px;max-width:95vw;box-shadow:var(--shl);max-height:90vh;overflow-y:auto;animation:su .2s}
.mh{padding:20px 22px 16px;border-bottom:1px solid #E4EAF2;display:flex;justify-content:space-between;align-items:center}
.mt{font-family:var(--fh);font-size:16px;font-weight:700;color:var(--navy)}
.mc{background:var(--mist);border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;color:var(--sub)}
.mb-m{padding:20px 22px}
.mf{padding:14px 22px 20px;display:flex;gap:9px;justify-content:flex-end;border-top:1px solid #E4EAF2}
.fg{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.fgi{display:flex;flex-direction:column;gap:4px}
.fgi.full{grid-column:span 2}
.fgi label{font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;letter-spacing:.5px}
.fgi input,.fgi select,.fgi textarea{font-family:var(--fb);font-size:13px;padding:8px 11px;border:1.5px solid #D0DAE8;border-radius:7px;outline:none;width:100%}
.fgi input:focus,.fgi select:focus,.fgi textarea:focus{border-color:var(--gold)}
.fgi textarea{resize:vertical;min-height:60px}

/* ── Users page ── */
.user-card{background:#fff;border:1px solid #E4EAF2;border-radius:9px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.user-info-block .uemail{font-weight:600;font-size:14px;color:var(--navy)}
.user-info-block .umeta{font-size:12px;color:var(--sub);margin-top:2px}
.invite-box{background:#F8FAFC;border:1.5px dashed #C9D8E8;border-radius:10px;padding:20px;margin-top:20px}
.invite-title{font-family:var(--fh);font-weight:700;font-size:14px;color:var(--navy);margin-bottom:12px}
.invite-row{display:flex;gap:10px;align-items:flex-end}
.mfa-note{background:#EEF8FF;border:1px solid #BDE0F5;border-radius:8px;padding:12px 16px;font-size:13px;color:var(--navy);margin-bottom:16px}

.toast{position:fixed;bottom:22px;right:22px;z-index:300;background:var(--navy);color:#fff;padding:12px 18px;border-radius:9px;font-size:13px;font-weight:500;box-shadow:var(--shl);border-left:4px solid var(--gold);animation:su .2s}
.doc-item{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid #F0F4FA;transition:background .1s}
.doc-item:hover{background:#FAFCFF}
.doc-item:last-child{border-bottom:none}
.doc-icon{font-size:22px;flex-shrink:0}
.doc-info{flex:1;min-width:0}
.doc-name{font-size:13px;font-weight:600;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.doc-meta{font-size:11px;color:var(--sub);margin-top:2px}
.doc-actions{display:flex;gap:6px;flex-shrink:0}
.upload-zone{border:2px dashed #C9D8E8;border-radius:10px;padding:24px;text-align:center;cursor:pointer;transition:all .15s;background:#F8FAFC}
.upload-zone:hover,.upload-zone.drag-over{border-color:var(--gold);background:#FFFDF5}
.upload-zone input{display:none}
.loading{display:flex;align-items:center;justify-content:center;height:200px;color:var(--sub);font-size:14px}
@keyframes fi{from{opacity:0}to{opacity:1}}
@keyframes su{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
`;

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function useConfirm() {
  const [state, setState] = useState(null); // {msg, resolve, title, danger}
  const confirm = (msg, opts={}) => new Promise(resolve => setState({ msg, resolve, title: opts.title||"Confirm", danger: opts.danger||false }));
  const Modal = state ? (
    <div className="modal-ov" style={{zIndex:9000}}>
      <div className="modal" style={{maxWidth:420}}>
        <div className="modal-header">
          <div className="modal-title">{state.title}</div>
        </div>
        <div className="modal-body">
          <p style={{fontSize:14,color:"var(--text)",lineHeight:1.6}}>{state.msg}</p>
        </div>
        <div className="modal-footer">
          <button className="modal-btn modal-btn-outline" onClick={()=>{state.resolve(false);setState(null);}}>Cancel</button>
          <button className={`modal-btn ${state.danger?"modal-btn-danger":"modal-btn-primary"}`} autoFocus onClick={()=>{state.resolve(true);setState(null);}}>
            {state.danger?"Yes, delete":"Confirm"}
          </button>
        </div>
      </div>
    </div>
  ) : null;
  return { confirm, Modal };
}

// ─── Small components ─────────────────────────────────────────────────────────
function Pill({s}){return <span className={`pill ${PC[s]||"p-occ"}`}>{SL[s]||s}</span>;}

function UCell({u,sel,onClick}){
  const isVacant=u.status==="available"||u.status==="vacant"||(!u.status&&!u.tenant);
  return(
    <div className={`uc ${UC[u.status]||"uc-occ"} ${sel?"sel":""}`} onClick={onClick}
      title={isVacant?`Unit ${u.id} — click to add tenant`:u.tenant||u.id}>
      <div className={`udot ${DC[u.status]||"d-occ"}`}/>
      <div className="uid">{u.id}</div>
      {u.tenant&&<div className="uten">{u.tenant}</div>}
      {u.rent&&<div className="uprice">£{u.rent}/mo</div>}
      {isVacant&&!u.tenant&&<div style={{fontSize:8,opacity:0.6,marginTop:1}}>+ tenant</div>}
    </div>
  );
}

function Legend(){
  return(
    <div className="legend">
      {[["#1A7F5A","Occupied"],["#E65100","In Arrears"],["#C0392B","Leaving"],["#F9A825","New Customer"],["#AB47BC","Pending"],["#1565C0","Available"]].map(([c,l])=>(
        <div key={l} className="li"><div className="ld" style={{background:c}}/>{l}</div>
      ))}
    </div>
  );
}

function ShieldLogo({size=36}){
  return(
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 2L4 8V18C4 25.4 10.2 32.2 18 34C25.8 32.2 32 25.4 32 18V8L18 2Z" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="1.5"/>
      <text x="18" y="23" textAnchor="middle" fill="white" fontSize="14" fontFamily="Georgia,serif" fontWeight="bold">C</text>
    </svg>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
function QRImage({svgString}){
  const [src,setSrc]=useState(null);
  useEffect(()=>{
    if(!svgString) return;
    try{
      const svg=svgString.startsWith("<svg")||svgString.startsWith("<?xml")
        ? svgString
        : `<svg>${svgString}</svg>`;
      const blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement("canvas");
        canvas.width=200; canvas.height=200;
        const ctx=canvas.getContext("2d");
        ctx.fillStyle="#ffffff";
        ctx.fillRect(0,0,200,200);
        ctx.drawImage(img,0,0,200,200);
        setSrc(canvas.toDataURL("image/png"));
        URL.revokeObjectURL(url);
      };
      img.src=url;
    }catch(e){}
  },[svgString]);
  if(!src) return <div style={{width:200,height:200,background:"#f5f5f5",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"#999",fontSize:12}}>Loading QR...</div>;
  return(
    <div>
      <img src={src} alt="MFA QR Code" style={{width:200,height:200,border:"2px solid #E4EAF2",borderRadius:8,imageRendering:"pixelated"}}/>
      <div style={{marginTop:8}}>
        <a href={src} download="cerect-mfa-qr.png" className="btn btn-outline btn-sm">⬇️ Download QR Code</a>
      </div>
    </div>
  );
}

function LoginPage({onLogin}){
  const [step,setStep]=useState("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [code,setCode]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [session,setSession]=useState(null);
  const [factorId,setFactorId]=useState(null);
  const [challengeId,setChallengeId]=useState(null);
  const [qrCode,setQrCode]=useState(null);
  const [secret,setSecret]=useState(null);

  async function handleLogin(e){
    e.preventDefault();
    setError(""); setLoading(true);
    try{
      const sess=await signIn(email,password);
      if(sess.error) throw new Error(sess.error_description||sess.msg||"Login failed");
      setSession(sess);
      const factors=await mfaListFactors(sess.access_token);
      const totpFactors=Array.isArray(factors)?factors.filter(f=>f.factor_type==="totp"&&f.status==="verified"):[];
      if(totpFactors.length>0){
        const f=totpFactors[0];
        setFactorId(f.id);
        const ch=await mfaChallenge(f.id,sess.access_token);
        setChallengeId(ch.id);
        setStep("mfa-verify");
      } else {
        setStep("mfa-setup");
      }
    }catch(err){
      setError(err.message||"Invalid email or password");
    }
    setLoading(false);
  }

  async function handleForgotPassword(e){
    e.preventDefault();
    setError(""); setLoading(true);
    try{
      await resetPassword(email);
      setStep("forgot-sent");
    }catch(err){
      setError("Could not send reset email — please try again");
    }
    setLoading(false);
  }

  async function handleSetupMFA(){
    setLoading(true); setError("");
    try{
      const enroll=await mfaEnroll(session.access_token);
      if(enroll.error||enroll.msg) throw new Error(enroll.error_description||enroll.msg||"Enrolment failed");
      if(enroll.id){
        setFactorId(enroll.id);
        setQrCode(enroll.totp?.qr_code);
        setSecret(enroll.totp?.secret);
        const ch=await mfaChallenge(enroll.id,session.access_token);
        setChallengeId(ch.id);
        setStep("mfa-enroll");
      } else {
        throw new Error("No factor ID returned");
      }
    }catch(err){
      setError("Could not set up MFA: "+err.message);
    }
    setLoading(false);
  }

  async function handleVerifyMFA(e){
    e.preventDefault();
    setError(""); setLoading(true);
    try{
      const result=await mfaVerify(factorId,challengeId,code.replace(/\s/g,""),session.access_token);
      if(result.access_token){
        onLogin({...session,access_token:result.access_token});
      } else {
        setError("Incorrect code — please try again");
        const ch=await mfaChallenge(factorId,session.access_token);
        setChallengeId(ch.id);
      }
    }catch(err){setError("Verification failed — please try again");}
    setLoading(false);
    setCode("");
  }

  async function skipMFA(){ onLogin(session); }

  return(
    <div className="login-page">
      <div className="login-box">
        <div className="login-logo" style={{flexDirection:"column",gap:8}}>
          <ShieldLogo size={52}/>
          <div className="login-logotext" style={{color:"var(--navy)"}}>cerect.</div>
        </div>

        {step==="login"&&(
          <>
            <p className="login-sub">Management Platform — Sign in to continue</p>
            {error&&<div className="login-err">{error}</div>}
            <form onSubmit={handleLogin}>
              <div className="login-field">
                <label>Email Address</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required autoFocus/>
              </div>
              <div className="login-field">
                <label>Password</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••" required/>
              </div>
              <button className="login-btn" type="submit" disabled={loading}>{loading?"Signing in...":"Sign In"}</button>
            </form>
            <button onClick={()=>{setStep("forgot");setError("");}} style={{width:"100%",background:"none",border:"none",color:"var(--sub)",fontSize:13,cursor:"pointer",padding:"10px",marginTop:4}}>
              Forgot your password?
            </button>
          </>
        )}

        {step==="forgot"&&(
          <>
            <p className="login-sub">Reset your password</p>
            <p style={{fontSize:13,color:"var(--sub)",marginBottom:16,textAlign:"center"}}>Enter your email address and we will send you a link to reset your password.</p>
            {error&&<div className="login-err">{error}</div>}
            <form onSubmit={handleForgotPassword}>
              <div className="login-field">
                <label>Email Address</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required autoFocus/>
              </div>
              <button className="login-btn" type="submit" disabled={loading}>{loading?"Sending...":"Send Reset Link"}</button>
            </form>
            <button onClick={()=>{setStep("login");setError("");}} style={{width:"100%",background:"none",border:"none",color:"var(--sub)",fontSize:13,cursor:"pointer",padding:"10px",marginTop:4}}>
              Back to login
            </button>
          </>
        )}

        {step==="forgot-sent"&&(
          <>
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:40,marginBottom:12}}>📧</div>
              <h3 style={{color:"var(--navy)",fontFamily:"var(--fh)",marginBottom:8}}>Check your inbox</h3>
              <p style={{fontSize:13,color:"var(--sub)",marginBottom:20}}>We have sent a password reset link to <strong>{email}</strong>. Click the link in the email to set a new password.</p>
              <p style={{fontSize:12,color:"var(--sub)"}}>Did not receive it? Check your spam folder or try again.</p>
            </div>
            <button className="login-btn" onClick={()=>{setStep("login");setError("");}} style={{marginTop:8}}>Back to Login</button>
          </>
        )}

        {step==="mfa-setup"&&(
          <>
            <p className="login-sub">One more step — secure your account</p>
            <div style={{background:"#EEF8FF",border:"1.5px solid #BDE0F5",borderRadius:9,padding:"16px",marginBottom:16,fontSize:13,color:"var(--navy)"}}>
              <div style={{fontWeight:700,marginBottom:8}}>🔐 Set up two-factor authentication</div>
              <p style={{fontSize:12,color:"var(--sub)",margin:"0 0 8px"}}>Two-factor authentication (2FA) adds an extra layer of security. After entering your password, you'll be asked for a 6-digit code from an app on your phone.</p>
              <p style={{fontSize:12,color:"var(--sub)",margin:"0 0 8px"}}><strong>You'll need:</strong> Google Authenticator or Authy installed on your phone (both free).</p>
              <p style={{fontSize:12,color:"var(--sub)",margin:0}}><strong>Important:</strong> Save the backup code shown during setup in a safe place — you'll need it if you lose your phone.</p>
            </div>
            {error&&<div className="login-err">{error}</div>}
            <button className="login-btn" onClick={handleSetupMFA} disabled={loading} style={{marginBottom:16}}>{loading?"Setting up...":"Set Up Authenticator App →"}</button>
            <div style={{borderTop:"1px solid #E4EAF2",paddingTop:12,textAlign:"center"}}>
              <p style={{fontSize:11,color:"var(--sub)",marginBottom:6}}>Not ready right now? You can set this up later from the Users & Security page.</p>
              <button onClick={skipMFA} style={{background:"none",border:"1px solid #D0DAE8",borderRadius:6,color:"var(--sub)",fontSize:11,cursor:"pointer",padding:"5px 12px"}}>Skip for now</button>
            </div>
          </>
        )}

        {step==="mfa-enroll"&&(
          <>
            <p className="login-sub">Scan this QR code with your authenticator app</p>
            {error&&<div className="login-err">{error}</div>}
            {qrCode&&<div style={{textAlign:"center",margin:"16px 0"}}><QRImage svgString={qrCode}/></div>}
            {secret&&(
              <div style={{background:"var(--mist)",borderRadius:7,padding:"8px 12px",marginBottom:14,fontSize:11,color:"var(--sub)",textAlign:"center"}}>
                Cannot scan? Enter this code manually:<br/>
                <strong style={{fontSize:13,letterSpacing:2,color:"var(--navy)"}}>{secret}</strong>
              </div>
            )}
            <form onSubmit={handleVerifyMFA}>
              <div className="login-field">
                <label>Enter 6-digit code from your app</label>
                <input type="text" inputMode="numeric" maxLength={7} value={code} onChange={e=>setCode(e.target.value)} placeholder="000000" autoFocus style={{textAlign:"center",letterSpacing:4,fontSize:20}}/>
              </div>
              <button className="login-btn" type="submit" disabled={loading||code.replace(/\s/g,"").length<6}>{loading?"Verifying...":"Verify & Enable MFA"}</button>
            </form>
          </>
        )}

        {step==="mfa-verify"&&(
          <>
            <p className="login-sub">Enter the 6-digit code from your authenticator app</p>
            {error&&<div className="login-err">{error}</div>}
            <form onSubmit={handleVerifyMFA}>
              <div className="login-field">
                <label>Authentication Code</label>
                <input type="text" inputMode="numeric" maxLength={7} value={code} onChange={e=>setCode(e.target.value)} placeholder="000000" autoFocus style={{textAlign:"center",letterSpacing:4,fontSize:20}}/>
              </div>
              <button className="login-btn" type="submit" disabled={loading||code.replace(/\s/g,"").length<6}>{loading?"Verifying...":"Verify"}</button>
            </form>
            <button onClick={()=>{setStep("forgot");setError("");}} style={{width:"100%",background:"none",border:"none",color:"var(--sub)",fontSize:13,cursor:"pointer",padding:"8px",marginTop:4}}>Forgot password?</button>
            <button onClick={()=>{setStep("login");setCode("");setError("");}} style={{width:"100%",background:"none",border:"none",color:"var(--sub)",fontSize:13,cursor:"pointer",padding:"4px"}}>Back to login</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({item,onClose,onSave,onDelete,onArchive,onChangeUnitId,isNew,areas=[],token,existingIds=[],orgId,showToast,onAudit}){
  const [form,setForm]=useState({...item});
  const [saving,setSaving]=useState(false);
  const [newArea,setNewArea]=useState("");
  const [showNewArea,setShowNewArea]=useState(false);
  const [saved,setSaved]=useState(false);
  const [newUnitId,setNewUnitId]=useState("");
  const [changingId,setChangingId]=useState(false);
  const [unitIdMsg,setUnitIdMsg]=useState("");
  const [showChangeId,setShowChangeId]=useState(false);
  const [savedForm,setSavedForm]=useState({...item});
  function formsEqual(a,b){
    const keys=new Set([...Object.keys(a),...Object.keys(b)]);
    for(const k of keys){
      const av=a[k]==null?"":String(a[k]);
      const bv=b[k]==null?"":String(b[k]);
      if(av!==bv) return false;
    }
    return true;
  }
  const isDirty=!formsEqual(form,savedForm);
  const u=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const n=k=>e=>setForm(f=>({...f,[k]:e.target.value===""?null:Number(e.target.value)}));

  function handleClose(){
    if(isDirty&&!window.confirm("You have unsaved changes. Close without saving?")) return;
    onClose();
  }

  async function handleChangeUnitId(){
    if(!newUnitId||newUnitId===form.id) return;
    // Check if new ID already exists
    const existing=existingIds&&existingIds.find(u=>u.id===newUnitId);
    if(existing){
      setUnitIdMsg(`❌ Unit "${newUnitId}" already exists${existing.tenant?` — occupied by ${existing.tenant}`:""}. Choose a different ID.`);
      return;
    }
    if(!window.confirm(`Change unit ID from "${form.id}" to "${newUnitId}"?\n\nThis will update all documents and records.`)) return;
    setChangingId(true);
    try{
      await onChangeUnitId(form.id, newUnitId);
      setForm(f=>({...f,id:newUnitId}));
      setShowChangeId(false);
      setNewUnitId("");
      setSaved(true);
      setTimeout(()=>setSaved(false),2000);
    }catch(e){showToast("Failed to change unit ID: "+e.message);}
    setChangingId(false);
  }

  async function save(){setSaving(true);await onSave(form);setSavedForm({...form});setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2000);}
  return(
    <div className="modal-ov" onClick={e=>e.target===e.currentTarget&&handleClose()}>
      <div className="modal">
        <div className="mh">
          <div className="mt">{isNew?"Add New Unit / Tenant":"Edit — "+(form.label||"Unit "+form.id)}</div>
          {isDirty&&<span style={{fontSize:11,color:"var(--gold)",fontWeight:600,marginRight:8}}>● Unsaved changes</span>}
          <button className="mc" onClick={handleClose}>✕</button>
        </div>
        {!isNew&&form.category==="Storage"&&(
          <div style={{padding:"8px 24px",borderBottom:"1px solid #E4EAF2",background:"#F8FAFC",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"var(--sub)"}}>Unit ID: <strong style={{color:"var(--navy)"}}>{form.id}</strong></span>
            {!showChangeId?(
              <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>{setShowChangeId(true);setNewUnitId(form.id);}}>✏️ Change Unit ID</button>
            ):(
              <div className="fr" style={{gap:6}}>
                <input value={newUnitId} onChange={e=>{setNewUnitId(e.target.value);setUnitIdMsg("");}} placeholder="New unit ID" style={{fontFamily:"var(--fb)",fontSize:12,padding:"4px 8px",border:"1.5px solid var(--gold)",borderRadius:6,width:120}}/>
                <button className="btn btn-primary btn-sm" onClick={handleChangeUnitId} disabled={changingId}>{changingId?"Updating…":"✓ Save"}</button>
                {unitIdMsg&&<span style={{fontSize:11,color:"var(--danger)",marginLeft:4}}>{unitIdMsg}</span>}
                <button className="btn btn-outline btn-sm" onClick={()=>setShowChangeId(false)}>✕</button>
              </div>
            )}
          </div>
        )}
        <div className="mb-m">
          <div className="fg">
            {isNew&&(form.category==="Storage")&&<div className="fgi"><label>Unit ID</label><input value={form.id||""} onChange={u("id")} placeholder="e.g. 73 or FP32"/></div>}
            {isNew&&<div className="fgi"><label>Category</label>
              <select value={form.category||"Storage"} onChange={u("category")}>
                {["Storage","Residential","Commercial"].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>}
            {(form.category==="Residential"||form.category==="Commercial")&&
              <div className="fgi full"><label>Property Name</label><input value={form.label||""} onChange={e=>setForm(f=>({...f,label:e.target.value,...(f.id?{}:{id:e.target.value.replace(/\s+/g,'').replace(/[^a-zA-Z0-9._-]/g,'_')})}))}/></div>}
            <div className="fgi full"><label>Tenant Name</label><input value={form.tenant||""} onChange={u("tenant")}/></div>
            <div className="fgi full"><label>Address</label><textarea value={form.address||""} onChange={u("address")} placeholder="Tenant's home or business address…" style={{minHeight:60}}/></div>
            <div className="fgi"><label>Email</label><input type="email" value={form.email||""} onChange={u("email")}/></div>
            <div className="fgi"><label>Phone</label><input value={form.phone||""} onChange={u("phone")}/></div>
            <div className="fgi"><label>Status</label>
              <select value={form.status||"occupied"} onChange={u("status")}>
                {STATUSES.map(s=><option key={s} value={s}>{SL[s]}</option>)}
              </select>
            </div>
            <div className="fgi"><label>Payment Method</label>
              <select value={form.payment||""} onChange={u("payment")}>
                <option value="">— Select —</option>
                {PAYMENTS.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="fgi"><label>Rent (ex-VAT) £/mo</label><input type="number" value={form.rent||""} onChange={n("rent")}/></div>
            <div className="fgi"><label>Rent (inc-VAT) £/mo</label><input type="number" value={form.vat_rent||""} onChange={n("vat_rent")}/></div>

            {/* Deposits & Keys section */}
            <div className="fgi full" style={{gridColumn:"span 2",borderTop:"1px solid #E4EAF2",paddingTop:12,marginTop:4}}>
              <label style={{fontSize:12,fontWeight:700,color:"var(--navy)",textTransform:"none",letterSpacing:0}}>Deposits & Keys</label>
            </div>
            <div className="fgi"><label>Lock/Fob Deposit Paid</label>
              <select value={form.lock_deposit_paid||""} onChange={u("lock_deposit_paid")}>
                <option value="">— Select —</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
            <div className="fgi"><label>Lock/Fob Deposit Amount £</label><input type="number" value={form.lock_deposit_amount||""} onChange={n("lock_deposit_amount")} placeholder="e.g. 50"/></div>
            <div className="fgi"><label>Tenant Deposit Held £</label><input type="number" value={form.tenant_deposit||""} onChange={n("tenant_deposit")} placeholder="e.g. 20"/></div>
            <div className="fgi"><label>Key / Lock Number</label><input value={form.key_number||""} onChange={u("key_number")} placeholder="e.g. 005, 33222"/></div>

            {form.category==="Storage"&&<>
              <div className="fgi full" style={{borderTop:"1px solid #E4EAF2",paddingTop:12,marginTop:4}}>
                <label style={{fontSize:12,fontWeight:700,color:"var(--navy)",textTransform:"none",letterSpacing:0}}>Unit Details</label>
              </div>
              <div className="fgi">
                <label>Row / Location</label>
                {showNewArea?(
                  <div className="fr" style={{gap:6}}>
                    <input style={{flex:1,fontFamily:"var(--fb)",fontSize:13,padding:"8px 11px",border:"1.5px solid var(--gold)",borderRadius:7,outline:"none"}} value={newArea} onChange={e=>setNewArea(e.target.value)} placeholder="New area name e.g. Row 8" autoFocus
                      onKeyDown={e=>{if(e.key==="Enter"&&newArea.trim()){setForm(f=>({...f,row_name:newArea.trim()}));setShowNewArea(false);setNewArea("");}}}
                    />
                    <button className="btn btn-primary btn-sm" onClick={()=>{if(newArea.trim()){setForm(f=>({...f,row_name:newArea.trim()}));setShowNewArea(false);setNewArea("");}}}>✓ Add</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>{setShowNewArea(false);setNewArea("");}}>✕</button>
                  </div>
                ):(
                  <div className="fr" style={{gap:6}}>
                    <select style={{flex:1,fontFamily:"var(--fb)",fontSize:13,padding:"8px 11px",border:"1.5px solid #D0DAE8",borderRadius:7,outline:"none"}} 
                      value={form.row_name||""} 
                      onChange={e=>setForm(f=>({...f,row_name:e.target.value,category:"Storage"}))}>
                      <option value="">— Select area —</option>
                      {areas.map(a=><option key={a} value={a}>{a}</option>)}
                      {form.row_name&&!areas.includes(form.row_name)&&(
                        <option value={form.row_name}>{form.row_name} (new)</option>
                      )}
                    </select>
                    <button className="btn btn-outline btn-sm" onClick={()=>setShowNewArea(true)} title="Add new area">+</button>
                  </div>
                )}
              </div>
              <div className="fgi"><label>Box Number</label><input value={form.box_no||""} onChange={u("box_no")}/></div>
              <div className="fgi"><label>Size</label><input value={form.size||""} onChange={u("size")} placeholder="e.g. XL(20ft)"/></div>
            </>}
            {(form.category==="Residential"||form.category==="Commercial")&&
              <div className="fgi"><label>Lease Review Date</label><input type="date" value={form.review||""} onChange={u("review")}/></div>}
            <div className="fgi"><label>Move-in Date</label><input type="date" value={form.move_in_date||""} onChange={u("move_in_date")}/></div>
            <div className="fgi"><label>Move-out Date</label><input type="date" value={form.move_out_date||""} onChange={e=>{
              const val=e.target.value;
              setForm(f=>({...f,move_out_date:val,
                status:val&&new Date(val)<=new Date()?"leaving":f.status
              }));
            }}/></div>
            <div className="fgi full"><label>Notes</label><textarea value={form.notes||""} onChange={u("notes")} placeholder="Additional notes, second address, special requirements…"/></div>
          </div>
        </div>
        {!isNew&&token&&(
          <div style={{borderTop:"1px solid #E4EAF2",padding:"16px 22px"}}>
            <div style={{fontFamily:"var(--fh)",fontSize:13,fontWeight:700,color:"var(--navy)",marginBottom:12}}>📁 Documents</div>
            <TenantDocuments tenantId={form.id} token={token} orgId={orgId} showToast={showToast} onAudit={onAudit}/>
          </div>
        )}
        <div className="mf">
          {!isNew&&<button className="btn btn-danger" onClick={()=>{onDelete(form.id);onClose();}}>Delete</button>}
          {!isNew&&<button className="btn btn-outline" style={{color:"#7B6F3A"}} onClick={()=>{if(onArchive){onArchive(form.id);onClose();}}}>📦 Archive</button>}
          <button className="btn btn-outline" onClick={handleClose}>Close</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?"Saving…":saved?"✅ Saved!":"Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({data,enquiries=[],tasks=[],onEdit,onAdd,onDelete,onGoTo}){
  const res=data.filter(d=>d.category==="Residential");
  const com=data.filter(d=>d.category==="Commercial");
  const stor=data.filter(d=>d.category==="Storage");
  const occ=stor.filter(u=>["occupied","arrears"].includes(u.status)).length;
  const activeStatuses=["occupied","arrears","new"];
  const storRent=stor.filter(u=>u.rent&&activeStatuses.includes(u.status)).reduce((a,b)=>a+(Number(b.rent)||0),0);
  const resRent=res.filter(u=>u.rent&&activeStatuses.includes(u.status)).reduce((a,b)=>a+(Number(b.rent)||0),0);
  const comRent=com.filter(u=>u.rent&&activeStatuses.includes(u.status)).reduce((a,b)=>a+(Number(b.rent)||0),0);
  const totalRent=storRent+resRent+comRent;
  const leaving=data.filter(u=>u.status==="leaving");
  const arrears=data.filter(u=>u.status==="arrears");
  const newC=data.filter(u=>u.status==="new");

  // Waiting list demand
  const activeEnquiries=enquiries.filter(e=>e.status==="waiting"||e.status==="contacted"||e.status==="reserved");
  const reservedEnquiries=enquiries.filter(e=>e.status==="reserved");
  const enqByCategory={
    Storage:activeEnquiries.filter(e=>e.category==="Storage").length,
    Residential:activeEnquiries.filter(e=>e.category==="Residential").length,
    Commercial:activeEnquiries.filter(e=>e.category==="Commercial").length,
  };

  // Vacancy match — vacant units with waiting enquiries in same category
  const vacantUnits=data.filter(u=>u.status==="available"||u.status==="vacant"||(!u.status&&!u.tenant&&u.id));
  const vacancyMatches=vacantUnits.map(u=>{
    const matches=activeEnquiries.filter(e=>e.category===u.category);
    return matches.length>0?{unit:u,count:matches.length}:null;
  }).filter(Boolean);

  // Rent review alerts — flag Residential/Commercial tenants whose review date is within 60 days
  // Storage units are excluded (ongoing agreements with no fixed review)
  const today=new Date(); today.setHours(0,0,0,0);
  const in60=new Date(today); in60.setDate(in60.getDate()+60);
  function parseReviewDate(str){
    if(!str) return null;
    const s=str.trim();
    // Date input stores as YYYY-MM-DD — parse in local time to avoid UTC offset issues
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
      const [y,m,d]=s.split("-").map(Number);
      return new Date(y,m-1,d);
    }
    return null;
  }
  const reviewSoon=data.filter(u=>{
    if(u.category==="Storage") return false; // Storage excluded
    if(!u.review||!["occupied","arrears","new"].includes(u.status)) return false;
    const d=parseReviewDate(u.review);
    if(!d) return false;
    return d>=today && d<=in60;
  });

  return(
    <div>
      {/* Revenue KPIs */}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}><button className="btn btn-outline btn-sm" onClick={()=>onGoTo&&onGoTo("tasks")}>🔧 Add Task</button></div>
      <div className="kg" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
        <div className="kc"><div className="kl">Total Monthly Revenue</div><div className="kv">£{totalRent.toLocaleString()}</div><div className="ks">All income ex-VAT</div><div className="ki">💷</div></div>
        <div className="kc"><div className="kl">Self-Storage Revenue</div><div className="kv">£{storRent.toLocaleString()}</div><div className="ks">{stor.filter(u=>activeStatuses.includes(u.status)&&u.rent).length} active units</div><div className="ki">📦</div></div>
        <div className="kc"><div className="kl">Residential Revenue</div><div className="kv">£{resRent.toLocaleString()}</div><div className="ks">{res.filter(u=>activeStatuses.includes(u.status)&&u.rent).length} properties</div><div className="ki">🏠</div></div>
        <div className="kc"><div className="kl">Commercial Revenue</div><div className="kv">£{comRent.toLocaleString()}</div><div className="ks">{com.filter(u=>activeStatuses.includes(u.status)&&u.rent).length} units</div><div className="ki">🏢</div></div>
      </div>
      {/* Occupancy KPIs */}
      <div className="kg" style={{gridTemplateColumns:"repeat(4,1fr)",marginTop:-6}}>
        <div className="kc"><div className="kl">Storage Occupancy</div><div className="kv">{occ}/{stor.length}</div><div className="ks">{Math.round(occ/Math.max(stor.length,1)*100)}% occupied</div><div className="ki">📊</div></div>
        <div className="kc"><div className="kl">New This Month</div><div className="kv">{newC.length}</div><div className="ks">Currently onboarding</div><div className="ki">🟡</div></div>
        <div className="kc"><div className="kl">Attention Required</div><div className="kv">{arrears.length+leaving.length}</div><div className="ks">{arrears.length} arrears · {leaving.length} leaving</div><div className="ki">⚠️</div></div>
        <div className="kc" style={{cursor:"pointer"}} onClick={()=>onGoTo&&onGoTo("enquiries")}>
          <div className="kl">Waiting List</div>
          <div className="kv">{activeEnquiries.length}</div>
          <div className="ks">
            {reservedEnquiries.length>0&&<span style={{color:"#7A5C00",fontWeight:600}}>{reservedEnquiries.length} reserved · </span>}
            {enqByCategory.Storage>0&&`${enqByCategory.Storage} storage`}
            {enqByCategory.Storage>0&&(enqByCategory.Residential>0||enqByCategory.Commercial>0)&&" · "}
            {enqByCategory.Residential>0&&`${enqByCategory.Residential} residential`}
            {enqByCategory.Residential>0&&enqByCategory.Commercial>0&&" · "}
            {enqByCategory.Commercial>0&&`${enqByCategory.Commercial} commercial`}
            {activeEnquiries.length===0&&"No active enquiries"}
          </div>
          <div className="ki">📋</div>
        </div>
      </div>
      <div className="g3">
        <div className="card">
          <div className="ch">
            <div className="ct">Residential Lets</div>
            <button className="btn btn-primary btn-sm" onClick={()=>onAdd("Residential")}>+ Add</button>
          </div>
          <div className="cb">
            {res.length===0&&<p className="tsub tsm">No residential properties added yet.</p>}
            {res.map(r=>(
              <div key={r.id} style={{padding:"9px 0",borderBottom:"1px solid #F0F4FA"}}>
                <div className="fb">
                  <span style={{fontWeight:600,fontSize:13,cursor:"pointer"}} onClick={()=>onEdit(r)}>{r.label||r.id}</span>
                  <div className="fr">
                    <Pill s={r.status}/>
                    <button className="btn btn-outline btn-sm" onClick={()=>onEdit(r)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={()=>{if(window.confirm(`Delete ${r.label||r.id}?`)){onDelete(r.id);}}}>🗑️</button>
                  </div>
                </div>
                <div className="tsub tsm" style={{marginTop:2}}>{r.tenant} · £{r.rent?.toLocaleString()}/mo</div>
                {r.review&&<div className="tsub tsm">Review: {r.review}</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="card sp2">
          <div className="ch">
            <div className="ct">Commercial Units</div>
            <button className="btn btn-primary btn-sm" onClick={()=>onAdd("Commercial")}>+ Add</button>
          </div>
          <div className="cb">
            {com.length===0&&<p className="tsub tsm">No commercial units added yet.</p>}
            <div className="tw"><table>
              <thead><tr><th>Property</th><th>Tenant</th><th>Payment</th><th>Ex-VAT</th><th>Inc-VAT</th><th>Review</th><th>Status</th><th></th></tr></thead>
              <tbody>{com.map(c=>(
                <tr key={c.id}>
                  <td style={{fontWeight:600}}>{c.label||c.id}</td>
                  <td>{c.tenant}</td>
                  <td><span className="chip">{c.payment}</span></td>
                  <td>£{c.rent}</td>
                  <td>{c.vat_rent?`£${c.vat_rent}`:"—"}</td>
                  <td style={{fontSize:12}}>{c.review||"—"}</td>
                  <td><Pill s={c.status}/></td>
                  <td>
                    <div className="fr">
                      <button className="btn btn-outline btn-sm" onClick={()=>onEdit(c)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={()=>{if(window.confirm(`Delete ${c.label||c.id}?`)){onDelete(c.id);}}}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
        </div>
      </div>
      {(arrears.length>0||leaving.length>0)&&(
        <div className="card">
          <div className="ch"><div className="ct">⚠️ Action Required</div></div>
          <div className="cb">
            {arrears.map(u=><div key={u.id} className="al-o">🟠 <strong>In Arrears</strong> — Unit {u.id} · {u.tenant} · £{u.rent}/mo<button className="btn btn-outline btn-sm" style={{marginLeft:12}} onClick={()=>onEdit(u)}>Edit</button></div>)}
            {leaving.map(u=><div key={u.id} className="al-r">🔴 <strong>Leaving</strong> — Unit {u.id} · {u.tenant} · £{u.rent}/mo<button className="btn btn-outline btn-sm" style={{marginLeft:12}} onClick={()=>onEdit(u)}>Edit</button></div>)}
          </div>
        </div>
      )}

      {/* Tasks due soon / overdue */}
      {(()=>{
        const tod=new Date();tod.setHours(0,0,0,0);
        const alertTasks=tasks.filter(t=>{
          if(t.status==="Done") return false;
          if(!t.due_date) return false;
          const d=new Date(t.due_date);
          const diff=Math.ceil((d-tod)/86400000);
          return diff<=(t.reminder_days||7);
        }).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date));
        if(alertTasks.length===0) return null;
        const overdueTasks=alertTasks.filter(t=>new Date(t.due_date)<tod);
        return(
          <div style={{background:overdueTasks.length>0?"#FFF0EE":"#FFF8E1",border:`1.5px solid ${overdueTasks.length>0?"#FFCDD2":"#FFD54F"}`,borderRadius:8,padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"flex-start",gap:10}}>
            <span style={{fontSize:18}}>🔧</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:overdueTasks.length>0?"var(--danger)":"#7A5C00",fontSize:13,marginBottom:4}}>
                {overdueTasks.length>0?`${overdueTasks.length} Overdue Task${overdueTasks.length!==1?"s":""}`:""}{overdueTasks.length>0&&alertTasks.length>overdueTasks.length?" · ":""}{alertTasks.length>overdueTasks.length?`${alertTasks.length-overdueTasks.length} Task${alertTasks.length-overdueTasks.length!==1?"s":""} Due Soon`:""}
              </div>
              <div style={{fontSize:12,color:overdueTasks.length>0?"var(--danger)":"#7A5C00"}}>
                {alertTasks.slice(0,4).map(t=>(
                  <span key={t.id} style={{display:"inline-flex",alignItems:"center",gap:4,marginRight:12,marginBottom:2}}>
                    <strong>{t.title}</strong>
                    {t.due_date&&<span style={{opacity:0.8}}>· {new Date(t.due_date)<tod?"was ":""}{new Date(t.due_date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>}
                    {t.assigned_to&&<span style={{opacity:0.7}}>· {t.assigned_to}</span>}
                  </span>
                ))}
                {alertTasks.length>4&&<span style={{opacity:0.7}}>+{alertTasks.length-4} more</span>}
              </div>
            </div>
            <button className="btn btn-sm" style={{fontSize:10,padding:"2px 8px",background:"#7A5C00",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",flexShrink:0}} onClick={()=>onGoTo&&onGoTo("tasks")}>View Tasks →</button>
          </div>
        );
      })()}

      {/* Vacancy match alerts */}
      {vacancyMatches.length>0&&(
        <div style={{background:"#EAF3DE",border:"1.5px solid #97C459",borderRadius:8,padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"flex-start",gap:10}}>
          <span style={{fontSize:18}}>🏠</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,color:"#27500A",fontSize:13,marginBottom:4}}>Vacancy Match — Waiting List</div>
            <div style={{fontSize:12,color:"#27500A"}}>
              {vacancyMatches.map(({unit,count})=>(
                <span key={unit.id} style={{display:"inline-flex",alignItems:"center",gap:6,marginRight:14,marginBottom:4}}>
                  <strong>{unit.label||unit.id}</strong> is vacant · <strong>{count}</strong> {unit.category} enquir{count===1?"y":"ies"} waiting
                  <button className="btn btn-sm" style={{fontSize:10,padding:"2px 8px",background:"#27500A",color:"#fff",border:"none",borderRadius:4,cursor:"pointer"}} onClick={()=>onGoTo&&onGoTo("enquiries")}>View Enquiries →</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Reserved tenants alert */}
      {reservedEnquiries.length>0&&(
        <div style={{background:"#FFF8E1",border:"1.5px solid #F6D860",borderRadius:8,padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"flex-start",gap:10}}>
          <span style={{fontSize:18}}>🔒</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,color:"#7A5C00",fontSize:13,marginBottom:4}}>Reserved — Awaiting Unit</div>
            <div style={{fontSize:12,color:"#7A5C00"}}>
              {reservedEnquiries.map(e=>(
                <span key={e.id} style={{display:"inline-flex",alignItems:"center",gap:6,marginRight:14,marginBottom:4}}>
                  <strong>{e.name}</strong> · {e.category}
                  {e.earmarked_unit&&<span>· earmarked for <strong>{e.earmarked_unit}</strong></span>}
                  <button className="btn btn-sm" style={{fontSize:10,padding:"2px 8px",background:"#7A5C00",color:"#fff",border:"none",borderRadius:4,cursor:"pointer"}} onClick={()=>onGoTo&&onGoTo("enquiries")}>View Enquiries →</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Rent review alerts */}
      {reviewSoon.length>0&&(
        <div style={{background:"#FFFBEA",border:"1.5px solid #F6D860",borderRadius:8,padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"flex-start",gap:10}}>
          <span style={{fontSize:18}}>📅</span>
          <div>
            <div style={{fontWeight:700,color:"#7A5C00",fontSize:13,marginBottom:4}}>Rent Review Due Soon</div>
            <div style={{fontSize:12,color:"#7A5C00"}}>
              {reviewSoon.map(u=>(
                <span key={u.id} style={{display:"inline-block",marginRight:12}}>
                  <strong>{u.label||u.id}</strong> {u.tenant?`· ${u.tenant}`:""} · Review: {u.review}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Site Plan ────────────────────────────────────────────────────────────────
function SitePlan({data,areas=[],onEdit,onAdd,onDelete,onRenameRow,onDeleteRow,onSaveAreaOrder,onAddArea,onSaveUnitOrder,showToast}){
  const [sel,setSel]=useState(null);
  const [filt,setFilt]=useState("all");
  const detailRef=useRef(null);
  const [dragOver,setDragOver]=useState(null);
  const dragRow=useRef(null);
  const dragUnit=useRef(null);
  const [dragOverUnit,setDragOverUnit]=useState(null);

  // Use areas from database
  const rowOrder=areas.map(a=>a.name);

  function saveRowOrder(newOrder){
    if(onSaveAreaOrder) onSaveAreaOrder(newOrder);
  }

  function handleDragStart(e,row){
    dragRow.current=row;
    e.dataTransfer.effectAllowed="move";
    e.dataTransfer.setData("text/plain",row);
  }

  function handleDragOver(e,row){
    e.preventDefault();
    e.dataTransfer.dropEffect="move";
    setDragOver(row);
  }

  function handleDrop(e,targetRow){
    e.preventDefault();
    // Try ref first, fall back to dataTransfer
    const fromRow=dragRow.current||(()=>{try{return e.dataTransfer.getData("text/plain");}catch{return null;}})();
    dragRow.current=null;
    setDragOver(null);
    if(!fromRow||fromRow===targetRow) return;
    const newOrder=[...rowOrder];
    const fromIdx=newOrder.indexOf(fromRow);
    const toIdx=newOrder.indexOf(targetRow);
    if(fromIdx<0||toIdx<0) return;
    const reordered=[...newOrder];
    reordered.splice(fromIdx,1);
    reordered.splice(toIdx,0,fromRow);
    saveRowOrder(reordered);
  }

  function handleDragEnd(){
    dragRow.current=null;
    setDragOver(null);
  }

  function handleUnitDragStart(e,unit){
    dragUnit.current=unit;
    e.dataTransfer.effectAllowed="move";
    e.dataTransfer.setData("unitId",unit.id);
  }

  function handleUnitDrop(e,targetId,rowUnits,targetRow){
    e.preventDefault();
    e.stopPropagation();
    const fromUnit=dragUnit.current;
    if(!fromUnit||fromUnit.id===targetId){setDragOverUnit(null);return;}

    const updates=[];
    const targetSorted=[...rowUnits].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    const toIdx=targetSorted.findIndex(u=>u.id===targetId);

    if(fromUnit.row_name===targetRow){
      // Same area — reorder
      const withoutFrom=targetSorted.filter(u=>u.id!==fromUnit.id);
      withoutFrom.splice(toIdx,0,fromUnit);
      withoutFrom.forEach((u,i)=>updates.push({id:u.id,sort_order:i,row_name:targetRow}));
    } else {
      // Cross-area — reindex source
      data.filter(u=>u.row_name===fromUnit.row_name&&u.id!==fromUnit.id)
        .sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
        .forEach((u,i)=>updates.push({id:u.id,sort_order:i,row_name:u.row_name}));
      // Insert into target
      const newTarget=[...targetSorted];
      newTarget.splice(toIdx<0?newTarget.length:toIdx,0,{...fromUnit,row_name:targetRow});
      newTarget.forEach((u,i)=>updates.push({id:u.id,sort_order:i,row_name:targetRow}));
    }

    if(onSaveUnitOrder) onSaveUnitOrder(updates);
    dragUnit.current=null;
    setDragOverUnit(null);
  }

  function selectUnit(id){
    setSel(prev=>{
      if(prev===id) return null;
      setTimeout(()=>detailRef.current?.scrollIntoView({behavior:"smooth",block:"center"}),100);
      return id;
    });
  }
  const [showAddUnit,setShowAddUnit]=useState(false);
  const [showAddArea,setShowAddArea]=useState(false);
  const [editingRow,setEditingRow]=useState(null);
  const [editingRowName,setEditingRowName]=useState("");
  const [newAreaName,setNewAreaName]=useState("");
  const [newUnit,setNewUnit]=useState({id:"",category:"Storage",row_name:"",size:"XL(20ft)",box_no:"",status:"available",tenant:"",rent:""});

  const stor=data.filter(d=>d.category==="Storage");
    const fu=arr=>filt==="all"?arr:arr.filter(u=>u.status===filt);
  const selU=stor.find(u=>u.id===sel);
  const nu=k=>e=>setNewUnit(f=>({...f,[k]:e.target.value}));

  function submitNewUnit(){
    if(!newUnit.id.trim()){showToast("Please enter a Unit ID");return;}
    const exists=stor.find(u=>u.id===newUnit.id.trim());
    if(exists){showToast(`❌ Unit "${newUnit.id.trim()}" already exists — choose a different ID`);return;}
    onAdd({...newUnit,id:newUnit.id.trim(),rent:newUnit.rent?Number(newUnit.rent):null,vat_rent:null,email:null,phone:null,label:null,section:null,review:null,notes:null});
    setNewUnit({id:"",category:"Storage",row_name:"",size:"XL(20ft)",box_no:"",status:"available",tenant:"",rent:""});
    setShowAddUnit(false);
  }

  function startRenameRow(row){
    setEditingRow(row);
    setEditingRowName(row);
  }

  function confirmRenameRow(){
    if(!editingRowName.trim()){return;}
    onRenameRow(editingRow,editingRowName.trim());
    setEditingRow(null);
  }

  function confirmDeleteRow(row){
    const units=stor.filter(u=>u.row_name===row);
    const occupied=units.filter(u=>u.tenant);
    const msg=occupied.length>0
      ? `⚠️ Delete "${row}"?\n\nThis area has ${units.length} unit${units.length!==1?"s":""}, ${occupied.length} of which ${occupied.length===1?"is":"are"} occupied:\n${occupied.map(u=>`• Unit ${u.id} — ${u.tenant}`).join("\n")}\n\nDeleting this area will permanently delete ALL units and tenant records within it. This cannot be undone.`
      : `Delete "${row}" and all ${units.length} unit${units.length!==1?"s":""} in it?\n\nThis cannot be undone.`;
    if(window.confirm(msg)){
      onDeleteRow(row);
    }
  }

  async function confirmAddArea(){
    if(!newAreaName.trim()){return;}
    if(onAddArea) await onAddArea(newAreaName.trim());
    setShowAddArea(false);
    setNewAreaName("");
  }

  return(
    <div>
      <div className="fb mb16" style={{flexWrap:"wrap",gap:10}}>
        <Legend/>
        <div className="fr" style={{flexWrap:"wrap",gap:5}}>
          {["all",...STATUSES].map(f=>(
            <button key={f} className="btn btn-sm btn-outline" style={filt===f?{background:"var(--navy)",color:"#fff",borderColor:"var(--navy)"}:{}} onClick={()=>setFilt(f)}>
              {f==="all"?"All":SL[f]}
            </button>
          ))}
          {filt==="all"&&<button className="btn btn-primary btn-sm" onClick={()=>{setShowAddUnit(!showAddUnit);setShowAddArea(false);}}>
            {showAddUnit?"✕ Cancel":"+ Add Unit"}
          </button>}
          {filt==="all"&&<button className="btn btn-navy btn-sm" onClick={()=>{setShowAddArea(!showAddArea);setShowAddUnit(false);}}>
            {showAddArea?"✕ Cancel":"+ Add Area"}
          </button>}
        </div>
      </div>

      {showAddArea&&(
        <div className="add-row-form">
          <div className="add-row-title">Add New Area / Row</div>
          <div className="fr" style={{gap:10}}>
            <input className="sin" style={{flex:1}} value={newAreaName} onChange={e=>setNewAreaName(e.target.value)} placeholder="e.g. Row 7, North Block, New Section"/>
            <button className="btn btn-primary" onClick={confirmAddArea}>Create Area</button>
          </div>
        </div>
      )}

      {showAddUnit&&(
        <div className="add-row-form">
          <div className="add-row-title">Add New Unit to Site Plan</div>
          <div className="add-row-grid">
            <div className="arf"><label>Unit ID *</label><input value={newUnit.id} onChange={nu("id")} placeholder="e.g. 73, 74, 75"/></div>
            <div className="arf"><label>Row / Area *</label>
              <select value={newUnit.row_name} onChange={nu("row_name")}>
                <option value="">— Select area —</option>
                {rowOrder.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="arf"><label>Status</label>
              <select value={newUnit.status} onChange={nu("status")}>
                {STATUSES.map(s=><option key={s} value={s}>{SL[s]}</option>)}
              </select>
            </div>
            <div className="arf"><label>Size (optional)</label><input value={newUnit.size} onChange={nu("size")} placeholder="e.g. XL(20ft)"/></div>
          </div>
          <p style={{fontSize:11,color:"var(--sub)",marginTop:10}}>Tenant details, rent, box number and other info can be added by clicking Edit on the unit afterwards.</p>
          <button className="btn btn-primary" style={{marginTop:10}} onClick={submitNewUnit}>Add Unit</button>
        </div>
      )}

      {rowOrder.map(row=>{
        const all=stor.filter(u=>u.row_name===row);
        return(
          <div key={row} style={{marginBottom:20,opacity:dragOver===row&&dragRow.current&&!dragUnit.current?0.5:1,transition:"opacity 0.15s",outline:dragOver===row&&dragRow.current&&!dragUnit.current?"2px dashed var(--gold)":"none",borderRadius:8}}
            onDragOver={e=>{if(dragRow.current&&!dragUnit.current)handleDragOver(e,row);else e.preventDefault();}}
            onDragEnter={e=>{e.preventDefault();if(dragRow.current&&!dragUnit.current)setDragOver(row);}}
            onDrop={e=>{if(dragUnit.current)return;handleDrop(e,row);}}
            onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragOver(null);}}
          >
            <div className="fb" style={{marginBottom:10,paddingBottom:8,borderBottom:"2px solid var(--gold)"}}>  
              {editingRow===row?(
                <div className="fr">
                  <input className="sin" value={editingRowName} onChange={e=>setEditingRowName(e.target.value)} style={{width:180}}/>
                  <button className="btn btn-success btn-sm" onClick={confirmRenameRow}>✓ Save</button>
                  <button className="btn btn-outline btn-sm" onClick={()=>setEditingRow(null)}>✕</button>
                </div>
              ):(
                <div className="fr">
                  <span 
                    draggable
                    onDragStart={e=>handleDragStart(e,row)}
                    onDragEnd={handleDragEnd}
                    style={{cursor:"grab",color:"var(--sub)",fontSize:16,marginRight:6,padding:"0 4px"}} title="Drag to reorder">⠿</span>
                  <div className="fr" style={{gap:8,alignItems:"center"}}>
                    <div style={{fontFamily:"var(--fb)",fontSize:17,fontWeight:700,color:"var(--navy)",letterSpacing:"0.2px"}}>{row}</div>
                    <div style={{fontSize:11,color:"var(--sub)",fontWeight:500,background:"var(--mist)",border:"1px solid #D8E2EE",borderRadius:20,padding:"2px 8px"}}>{all.length} units</div>
                  </div>
                  {filt==="all"&&<button className="btn btn-outline btn-sm" onClick={()=>startRenameRow(row)} title="Rename this area">✏️ Rename</button>}
                  {filt==="all"&&<button className="btn btn-danger btn-sm" onClick={()=>confirmDeleteRow(row)} title="Delete this area and all its units">🗑️ Delete Area</button>}
                </div>
              )}
            </div>
            <div className="ug">{fu([...all].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))).map(u=>(
              <div key={u.id}
                draggable={filt==="all"}
                onDragStart={e=>handleUnitDragStart(e,u)}
                onDragOver={e=>{e.preventDefault();e.stopPropagation();setDragOverUnit(u.id);}}
                onDrop={e=>handleUnitDrop(e,u.id,[...all].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)),row)}
                onDragEnd={()=>{dragUnit.current=null;setDragOverUnit(null);}}
                style={{opacity:dragOverUnit===u.id&&dragUnit.current?.id!==u.id?0.5:1,outline:dragOverUnit===u.id&&dragUnit.current?.id!==u.id?"2px dashed var(--gold)":"none",borderRadius:8}}
              >
                <UCell u={u} sel={sel===u.id} onClick={()=>selectUnit(u.id)}/>
              </div>
            ))}</div>
          </div>
        );
      })}



      {stor.filter(u=>!u.row_name).length>0&&(
        <div style={{marginBottom:16}}>
          <div className="fb" style={{marginBottom:8}}>
            <div className="fr" style={{gap:8,alignItems:"center"}}>
              <div style={{fontFamily:"var(--fh)",fontSize:15,fontWeight:800,color:"#C0392B",letterSpacing:"0.3px"}}>⚠️ Unassigned</div>
              <div style={{fontSize:11,color:"var(--sub)",fontWeight:500,background:"#FFF0EE",border:"1px solid #FFCDD2",borderRadius:20,padding:"2px 8px"}}>{stor.filter(u=>!u.row_name).length} units — no area set</div>
            </div>
          </div>
          <div className="ug">{fu(stor.filter(u=>!u.row_name)).map(u=><UCell key={u.id} u={u} sel={sel===u.id} onClick={()=>selectUnit(u.id)}/>)}</div>
        </div>
      )}

      {selU&&(
        <div className="dpanel" ref={detailRef}>
          <div className="fb mb16">
            <span style={{fontFamily:"var(--fh)",fontWeight:700,fontSize:15}}>Unit {selU.id}</span>
            <div className="fr">
              <Pill s={selU.status}/>
              <button className="btn btn-primary btn-sm" onClick={()=>onEdit(selU)}>✏️ Edit</button>
              <button className="btn btn-danger btn-sm" onClick={()=>{
                const isOccupied=selU.tenant||["occupied","new","arrears","leaving"].includes(selU.status);
                if(isOccupied){
                  showToast(`⛔ Unit ${selU.id} has a tenant — archive them first before deleting the unit`);
                  return;
                }
                if(window.confirm(`Permanently delete empty Unit ${selU.id} from the site plan?\n\nThis cannot be undone.`)){
                  onDelete(selU.id);setSel(null);
                }
              }}>🗑️ Delete Unit</button>
              <button className="btn btn-outline btn-sm" onClick={()=>setSel(null)}>✕ Close</button>
            </div>
          </div>
          <div className="dgrid">
            {[["Box Ref",selU.box_no||"—"],["Size",selU.size||"—"],["Row",selU.row_name||"—"],["Tenant",selU.tenant||"Vacant"],["Payment",selU.payment||"—"],["Ex-VAT",selU.rent?"£"+selU.rent:"—"],["Inc-VAT",selU.vat_rent?"£"+selU.vat_rent:"—"],["Email",selU.email||"—"],["Phone",selU.phone||"—"],["Key/Lock No.",selU.key_number||"—"],["Lock Deposit Paid",selU.lock_deposit_paid||"—"],["Lock Deposit Amt",selU.lock_deposit_amount?"£"+selU.lock_deposit_amount:"—"],["Tenant Deposit",selU.tenant_deposit?"£"+selU.tenant_deposit:"—"],["Address",selU.address||"—"],["Notes",selU.notes||"—"]].map(([k,v])=>(
              <div key={k}><div className="dlabel">{k}</div><div className="dval">{v}</div></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── All Tenants ──────────────────────────────────────────────────────────────
const DEFAULT_COLS=[
  {key:"unit",label:"Unit"},
  {key:"category",label:"Category"},
  {key:"tenant",label:"Tenant"},
  {key:"size",label:"Size"},
  {key:"payment",label:"Payment"},
  {key:"exvat",label:"Ex-VAT"},
  {key:"incvat",label:"Inc-VAT"},
  {key:"email",label:"Email"},
  {key:"status",label:"Status"},
];

function Tenants({data,onEdit,onAdd,onArchive}){
  const [q,setQ]=useState("");
  const [filt,setFilt]=useState("all");
  const [cat,setCat]=useState("all");
  const [sortKey,setSortKey]=useState(null);
  const [sortDir,setSortDir]=useState("asc");
  const [selected,setSelected]=useState(new Set());

  function toggleSelect(id){setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});}
  function toggleAll(){setSelected(s=>s.size===sorted.length?new Set():new Set(sorted.map(t=>t.id)));}
  function clearSelected(){setSelected(new Set());}

  function handleSort(key){
    if(sortKey===key) setSortDir(d=>d==="asc"?"desc":"asc");
    else{setSortKey(key);setSortDir("asc");}
  }
  function sortArrow(key){
    if(sortKey!==key) return <span style={{opacity:0.25,marginLeft:3}}>↕</span>;
    return <span style={{marginLeft:3}}>{sortDir==="asc"?"↑":"↓"}</span>;
  }
  const [cols,setCols]=useState(()=>{
    try{const s=localStorage.getItem("cam_col_order");return s?JSON.parse(s):DEFAULT_COLS;}catch{return DEFAULT_COLS;}
  });
  const dragCol=useRef(null);
  const [dragOverCol,setDragOverCol]=useState(null);

  function handleColDragStart(e,key){dragCol.current=key;e.dataTransfer.effectAllowed="move";}
  function handleColDragOver(e,key){e.preventDefault();setDragOverCol(key);}
  function handleColDrop(e,targetKey){
    e.preventDefault();
    if(!dragCol.current||dragCol.current===targetKey) return;
    const newCols=[...cols];
    const fromIdx=newCols.findIndex(c=>c.key===dragCol.current);
    const toIdx=newCols.findIndex(c=>c.key===targetKey);
    newCols.splice(fromIdx,1);
    newCols.splice(toIdx,0,cols[fromIdx]);
    setCols(newCols);
    try{localStorage.setItem("cam_col_order",JSON.stringify(newCols));}catch{}
    dragCol.current=null;
    setDragOverCol(null);
  }
  function handleColDragEnd(){dragCol.current=null;setDragOverCol(null);}

  const filtered=data.filter(t=>{
    const ms=filt==="all"||t.status===filt;
    const mc=cat==="all"||t.category===cat;
    const mq=!q||(t.tenant||"").toLowerCase().includes(q.toLowerCase())||(t.id||"").toLowerCase().includes(q.toLowerCase())||(t.email||"").toLowerCase().includes(q.toLowerCase());
    return ms&&mc&&mq;
  });
  const rev=filtered.filter(t=>t.rent&&["occupied","arrears","new"].includes(t.status)).reduce((a,b)=>a+(Number(b.rent)||0),0);

  const sorted = sortKey ? [...filtered].sort((a,b)=>{
    let av, bv;
    if(sortKey==="exvat"||sortKey==="incvat"){
      av=Number(sortKey==="exvat"?a.rent:a.vat_rent)||0;
      bv=Number(sortKey==="exvat"?b.rent:b.vat_rent)||0;
    } else if(sortKey==="tenant"){
      av=(a.tenant||"").toLowerCase(); bv=(b.tenant||"").toLowerCase();
    } else if(sortKey==="unit"){
      av=(a.label||a.id||"").toLowerCase(); bv=(b.label||b.id||"").toLowerCase();
    } else if(sortKey==="status"){
      av=a.status||""; bv=b.status||"";
    } else if(sortKey==="category"){
      av=a.category||""; bv=b.category||"";
    } else {
      av=(a[sortKey]||"").toString().toLowerCase(); bv=(b[sortKey]||"").toString().toLowerCase();
    }
    if(av<bv) return sortDir==="asc"?-1:1;
    if(av>bv) return sortDir==="asc"?1:-1;
    return 0;
  }) : filtered;

  function renderCell(t,key){
    switch(key){
      case "unit": return <td key={key} style={{fontFamily:"var(--fh)",fontWeight:700,whiteSpace:"nowrap"}}>{t.label||("Unit "+t.id)}</td>;
      case "category": return <td key={key}><span className="chip">{t.category}</span></td>;
      case "tenant": return <td key={key} style={{maxWidth:180}}>{t.tenant||<span style={{color:"var(--sub)"}}>Vacant</span>}</td>;
      case "size": return <td key={key} style={{fontSize:12}}>{t.size||"—"}</td>;
      case "payment": return <td key={key}>{t.payment?<span className="chip">{t.payment}</span>:"—"}</td>;
      case "exvat": return <td key={key} style={{fontWeight:600}}>{t.rent?"£"+t.rent:"—"}</td>;
      case "incvat": return <td key={key}>{t.vat_rent?"£"+t.vat_rent:"—"}</td>;
      case "email": return <td key={key} style={{fontSize:11,color:"var(--sub)",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.email||"—"}</td>;
      case "status": return <td key={key}><Pill s={t.status}/></td>;
      default: return <td key={key}>—</td>;
    }
  }

  return(
    <div>
      <div className="fb mb20" style={{flexWrap:"wrap",gap:10}}>
        <div className="fr" style={{flexWrap:"wrap",gap:6}}>
          <input className="sin sinw" placeholder="Search tenant, unit, email…" value={q} onChange={e=>setQ(e.target.value)}/>
          {["all","Residential","Commercial","Storage"].map(c=>(
            <button key={c} className="btn btn-sm btn-outline" style={cat===c?{background:"var(--navy)",color:"#fff",borderColor:"var(--navy)"}:{}} onClick={()=>setCat(c)}>{c==="all"?"All Categories":c}</button>
          ))}
          {["all",...STATUSES].map(f=>(
            <button key={f} className="btn btn-sm btn-outline" style={filt===f?{background:"#1A7F5A",color:"#fff",borderColor:"#1A7F5A"}:{}} onClick={()=>setFilt(f)}>{f==="all"?"All Statuses":SL[f]}</button>
          ))}
        </div>
        <div className="fr" style={{gap:6}}>
          <button className="btn btn-outline btn-sm" onClick={()=>{setCols(DEFAULT_COLS);try{localStorage.removeItem("cam_col_order");}catch{}}} title="Reset column order">↺ Reset Columns</button>
          <div style={{fontSize:12,color:"#7A5C00",padding:"8px 14px",background:"#FFFBEA",border:"1.5px solid #F6D860",borderRadius:8,fontWeight:500}}>
            💡 To add a storage tenant, click a vacant unit on the <span style={{color:"var(--navy)",fontWeight:700,textDecoration:"underline",cursor:"pointer"}} onClick={()=>window.__camSetPage&&window.__camSetPage("site")}>Site Plan</span>
          </div>
        </div>
      </div>
      {selected.size>0&&(
        <div style={{background:"#EEF4FF",border:"1.5px solid #B8D0F8",borderRadius:8,padding:"10px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{fontWeight:600,fontSize:13,color:"var(--navy)"}}>{selected.size} selected</span>
          <button className="btn btn-outline btn-sm" onClick={()=>{
            if(!window.confirm(`Archive ${selected.size} tenant(s)?`)) return;
            selected.forEach(id=>onArchive(id));
            clearSelected();
          }}>📦 Archive selected</button>
          <button className="btn btn-outline btn-sm" style={{color:"var(--danger)"}} onClick={()=>{
            if(!window.confirm(`Delete ${selected.size} tenant(s)? This cannot be undone.`)) return;
            selected.forEach(id=>onArchive(id));
            clearSelected();
          }}>🗑️ Delete selected</button>
          <button className="btn btn-outline btn-sm" onClick={clearSelected}>✕ Clear</button>
        </div>
      )}
      <div className="card">
        <div className="tw"><table>
          <thead><tr>
            <th style={{width:32}}>
              <input type="checkbox" checked={selected.size===sorted.length&&sorted.length>0} onChange={toggleAll} title="Select all"/>
            </th>
            {cols.map(col=>(
              <th key={col.key}
                draggable
                onDragStart={e=>handleColDragStart(e,col.key)}
                onDragOver={e=>handleColDragOver(e,col.key)}
                onDrop={e=>handleColDrop(e,col.key)}
                onDragEnd={handleColDragEnd}
                onClick={()=>handleSort(col.key)}
                style={{cursor:"pointer",userSelect:"none",opacity:dragOverCol===col.key?0.5:1,whiteSpace:"nowrap"}}
                title="Click to sort · Drag to reorder"
              >
                <span style={{marginRight:4,opacity:0.4}}>⠿</span>{col.label}{sortArrow(col.key)}
              </th>
            ))}
            <th></th>
          </tr></thead>
          <tbody>{sorted.slice(0,200).map((t,i)=>(
            <tr key={i} style={{background:selected.has(t.id)?"#F0F6FF":""}}>
              <td><input type="checkbox" checked={selected.has(t.id)} onChange={()=>toggleSelect(t.id)}/></td>
              {cols.map(col=>renderCell(t,col.key))}
              <td>
                <div className="fr" style={{gap:4}}>
                  <button className="btn btn-outline btn-sm" onClick={()=>onEdit(t)}>Edit</button>
                  <button className="btn btn-outline btn-sm" style={{color:"#7B6F3A"}} onClick={()=>onArchive(t.id)} title="Archive this tenant">📦</button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
        <div style={{padding:"9px 16px",fontSize:12,color:"var(--sub)",borderTop:"1px solid #E4EAF2"}}>
          {sorted.length} records · £{rev.toLocaleString()}/mo filtered revenue · <span style={{opacity:0.6}}>Click column headers to sort · Drag to reorder · Checkbox to select</span>
        </div>
      </div>
    </div>
  );
}

// ─── Payments ─────────────────────────────────────────────────────────────────
// ─── Payment record helpers ──────────────────────────────────────────────────
async function paymentRecordList(month, token, orgId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/payment_records?org_id=eq.${orgId}&period_month=eq.${month}&order=paid_at.desc`,
    { headers: authH(token) }
  );
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
async function paymentRecordSave(record, token) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/payment_records`, {
    method: "POST",
    headers: { ...authH(record._token || token), Prefer: "return=representation" },
    body: JSON.stringify(record)
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
async function paymentRecordDelete(id, token) {
  await fetch(`${SUPABASE_URL}/rest/v1/payment_records?id=eq.${id}`, {
    method: "DELETE", headers: authH(token)
  });
}
async function paymentRecordHistory(tenantId, token, orgId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/payment_records?org_id=eq.${orgId}&tenant_id=eq.${encodeURIComponent(tenantId)}&order=period_month.desc&limit=24`,
    { headers: authH(token) }
  );
  return r.ok ? r.json() : [];
}

// ─── Payments Page ────────────────────────────────────────────────────────────
function Payments({data, token, showToast, onStatusUpdate, orgId, onAudit}){
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`);
  const [records, setRecords] = useState([]);
  const [loadingRec, setLoadingRec] = useState(false);
  const [markingId, setMarkingId] = useState(null);
  const [historyTenant, setHistoryTenant] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [notesModal, setNotesModal] = useState(null);
  const [dbError, setDbError] = useState(false);

  const active = data.filter(u => ["occupied","new","arrears"].includes(u.status) && u.rent);

  useEffect(() => {
    if (!token || !orgId) return;
    setLoadingRec(true);
    setDbError(false);
    paymentRecordList(viewMonth, token, orgId)
      .then(r => { setRecords(Array.isArray(r) ? r : []); })
      .catch(() => { setDbError(true); setRecords([]); })
      .finally(() => setLoadingRec(false));
  }, [viewMonth, token, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthLabel = (m) => {
    const [y, mo] = m.split("-");
    return new Date(Number(y), Number(mo)-1, 1).toLocaleString("en-GB", {month:"long", year:"numeric"});
  };
  const prevMonth = () => {
    const [y, mo] = viewMonth.split("-").map(Number);
    const d = new Date(y, mo-2, 1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
  };
  const nextMonth = () => {
    const [y, mo] = viewMonth.split("-").map(Number);
    const d = new Date(y, mo, 1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
  };
  const isCurrentMonth = viewMonth === `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  const paidIds = new Set(records.map(r => r.tenant_id));
  const paid = active.filter(u => paidIds.has(u.id));
  const unpaid = active.filter(u => !paidIds.has(u.id));
  const totalRent = active.reduce((a,b) => a+(Number(b.rent)||0), 0);
  const totalCollected = paid.reduce((a,b) => a+(Number(b.rent)||0), 0);
  const totalOutstanding = unpaid.reduce((a,b) => a+(Number(b.rent)||0), 0);

  // Overdue = unpaid and we're past the 7th of the month (only meaningful for current month)
  const dayOfMonth = now.getDate();
  const isOverdueMonth = isCurrentMonth && dayOfMonth > 7;
  const overdueCount = isCurrentMonth ? unpaid.length : 0;

  async function handleMarkPaid(unit, payload="") {
    const notes = typeof payload === "object" ? (payload.notes||"") : (payload||"");
    const clearArrears = typeof payload === "object" ? !!payload.clearArrears : false;
    setMarkingId(unit.id);
    try {
      const rec = {
        org_id: orgId,
        tenant_id: unit.id,
        period_month: viewMonth,
        amount: Number(unit.rent)||0,
        method: unit.payment||"",
        notes: notes,
        paid_at: new Date().toISOString()
      };
      const saved = await paymentRecordSave(rec, token);
      // saved may be an array (Supabase returns array for POST with return=representation)
      const record = Array.isArray(saved) ? saved[0] : saved;
      if (record && record.id) {
        setRecords(r => [...r, record]);
        setDbError(false);
        if(unit.status==="arrears" && clearArrears && onStatusUpdate){
          await onStatusUpdate(unit.id, "occupied");
          if(onAudit) onAudit("payment","tenant",unit.id,unit.tenant||unit.id,{month:viewMonth,amount:unit.rent,arrears_cleared:true});
          showToast(`✅ ${unit.tenant||unit.id} marked as paid · arrears status cleared`);
        } else {
          if(onAudit) onAudit("payment","tenant",unit.id,unit.tenant||unit.id,{month:viewMonth,amount:unit.rent});
          showToast(`✅ ${unit.tenant||unit.id} marked as paid`);
        }
      } else {
        showToast("❌ Save failed — please try again");
      }
    } catch(e) {
      console.warn("handleMarkPaid error:", e.message);
      showToast("❌ Save failed: " + e.message);
    }
    setMarkingId(null);
  }

  async function handleUnmark(unit) {
    const rec = records.find(r => r.tenant_id === unit.id);
    if (!rec) return;
    if (!window.confirm(`Remove payment record for ${unit.tenant||unit.id} for ${monthLabel(viewMonth)}?`)) return;
    await paymentRecordDelete(rec.id, token);
    setRecords(r => r.filter(x => x.id !== rec.id));
    if(onAudit) onAudit("payment_removed","tenant",unit.id,unit.tenant||unit.id,{month:viewMonth});
    showToast("↩️ Payment record removed");
  }

  async function openHistory(unit) {
    setHistoryTenant(unit);
    setHistoryLoading(true);
    const h = await paymentRecordHistory(unit.id, token, orgId);
    setHistory(Array.isArray(h) ? h : []);
    setHistoryLoading(false);
  }

  function exportReconciliation() {
    const rows = [
      ["Unit", "Tenant", "Payment Method", "Rent/mo", "Status", "Paid", "Date Paid", "Reference"]
    ];
    sortedActive.forEach(u => {
      const rec = getRecord(u.id);
      rows.push([
        u.id,
        u.tenant||"",
        u.payment||"",
        u.rent||"",
        SL[u.status]||u.status,
        rec ? "Yes" : "No",
        rec?.paid_at ? new Date(rec.paid_at).toLocaleDateString("en-GB") : "",
        rec?.notes||""
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");
    XLSX.writeFile(wb, `Cerect_Payments_${viewMonth}.xlsx`);
  }

  const getRecord = (uid) => records.find(r => r.tenant_id === uid);

  // Sort: unpaid first (arrears at top), then paid
  const sortedActive = [
    ...unpaid.sort((a,b) => (a.status==="arrears"?-1:0)-(b.status==="arrears"?-1:0)),
    ...paid
  ];

  return (
    <div>
      {/* Month navigator */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button className="btn btn-outline btn-sm" onClick={prevMonth}>← Prev</button>
          <div style={{fontFamily:"var(--fh)",fontSize:20,fontWeight:700,color:"var(--navy)",minWidth:180,textAlign:"center"}}>{monthLabel(viewMonth)}</div>
          <button className="btn btn-outline btn-sm" onClick={nextMonth} disabled={isCurrentMonth}>Next →</button>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {isCurrentMonth && isOverdueMonth && overdueCount > 0 && (
            <div style={{background:"#FFF0EE",border:"1.5px solid #FFCDD2",borderRadius:8,padding:"7px 14px",fontSize:13,color:"var(--danger)",fontWeight:600}}>
              ⚠️ {overdueCount} tenant{overdueCount!==1?"s":""} not yet marked paid
            </div>
          )}
        </div>
      </div>

      {dbError && (
        <div style={{background:"#FFF8E1",border:"1.5px solid #FFD54F",borderRadius:8,padding:"14px 18px",marginBottom:18,fontSize:13,color:"#5D4037"}}>
          <strong>⚙️ One-time setup required</strong><br/>
          The payment tracking table doesn't exist yet in your database. Run this SQL in your <a href="https://supabase.com/dashboard/project/lbealsgloqoepazfrgbj/sql/new" target="_blank" rel="noreferrer" style={{color:"var(--navy)"}}>Supabase SQL editor</a>:<br/><br/>
          <code style={{display:"block",background:"#F5F5F5",padding:"10px 12px",borderRadius:6,fontSize:12,fontFamily:"monospace",whiteSpace:"pre-wrap"}}>{"alter table payment_records add column if not exists org_id uuid;\nalter table payment_records drop constraint if exists payment_records_tenant_id_period_month_key;\nalter table payment_records add constraint if not exists payment_records_org_tenant_month_key unique(org_id, tenant_id, period_month);\nalter table payment_records disable row level security;\ngrant select, insert, update, delete on table payment_records to anon, authenticated;"}</code>
        </div>
      )}

      {/* Summary cards */}
      <div className="kg" style={{gridTemplateColumns:"repeat(3,1fr)",marginBottom:20}}>
        <div className="kc">
          <div className="kl">Collected</div>
          <div className="kv" style={{color:"var(--success)"}}>£{totalCollected.toLocaleString()}</div>
          <div className="ks">{paid.length} of {active.length} tenants</div>
        </div>
        <div className="kc">
          <div className="kl">Outstanding</div>
          <div className="kv" style={{color:totalOutstanding>0?"var(--danger)":"var(--success)"}}>£{totalOutstanding.toLocaleString()}</div>
          <div className="ks">{unpaid.length} tenant{unpaid.length!==1?"s":""} remaining</div>
        </div>
        <div className="kc">
          <div className="kl">Monthly Total</div>
          <div className="kv">£{totalRent.toLocaleString()}</div>
          <div className="ks">{active.length} active tenants</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--sub)",marginBottom:6}}>
          <span>{totalRent>0?Math.round(totalCollected/totalRent*100):0}% collected</span>
          <span>£{totalCollected.toLocaleString()} of £{totalRent.toLocaleString()}</span>
        </div>
        <div className="pb" style={{height:10}}>
          <div className="pbf" style={{width:`${totalRent>0?Math.round(totalCollected/totalRent*100):0}%`,background:"var(--success)"}}/>
        </div>
      </div>

      {/* Tenant list */}
      <div className="card">
        <div className="ch" style={{paddingBottom:14}}>
          <div className="ct">Payment Reconciliation</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {loadingRec && <span style={{fontSize:12,color:"var(--sub)"}}>Loading…</span>}
            <button className="btn btn-outline btn-sm" onClick={exportReconciliation}>⬇️ Export to Excel</button>
          </div>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Unit</th>
                <th>Tenant</th>
                <th>Method</th>
                <th style={{textAlign:"right"}}>Rent/mo</th>
                <th>Status</th>
                <th style={{textAlign:"right"}}>Paid</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedActive.map(u => {
                const rec = getRecord(u.id);
                const isPaid = !!rec;
                const paidDate = rec?.paid_at ? new Date(rec.paid_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}) : null;
                return (
                  <tr key={u.id} style={{background:isPaid?"#F7FDF9":u.status==="arrears"?"#FFFAF5":""}}>
                    <td style={{fontWeight:700,color:"var(--navy)"}}>{u.id}</td>
                    <td style={{maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      <button onClick={()=>openHistory(u)} style={{background:"none",border:"none",color:"var(--navy)",fontWeight:600,fontSize:13,cursor:"pointer",padding:0,textAlign:"left",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {u.tenant||"—"}
                      </button>
                    </td>
                    <td style={{fontSize:12,color:"var(--sub)"}}>{u.payment||"—"}</td>
                    <td style={{textAlign:"right",fontWeight:600}}>£{(Number(u.rent)||0).toLocaleString()}</td>
                    <td><span className={`pill ${PC[u.status]||"p-occ"}`}>{SL[u.status]||u.status}</span></td>
                    <td style={{textAlign:"right",fontSize:12}}>
                      {isPaid
                        ? <span style={{color:"var(--success)",fontWeight:600}} title={rec?.notes||""}>✓ {paidDate}{rec?.notes&&<span style={{fontSize:10,color:"var(--sub)",fontWeight:400,marginLeft:4}}>· {rec.notes}</span>}</span>
                        : <span style={{color:isOverdueMonth&&isCurrentMonth?"var(--danger)":"var(--sub)"}}>—</span>
                      }
                    </td>
                    <td style={{textAlign:"right"}}>
                      {isPaid
                        ? <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>handleUnmark(u)}>↩ Undo</button>
                        : <button className="btn btn-success btn-sm" onClick={()=>setNotesModal({unit:u})} disabled={markingId===u.id}>
                            {markingId===u.id?"…":"✓ Mark paid"}
                          </button>
                      }
                    </td>
                  </tr>
                );
              })}
              {active.length===0&&(
                <tr><td colSpan={7} style={{textAlign:"center",color:"var(--sub)",padding:"28px 0"}}>No active tenants found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes modal — shown before marking paid */}
      {notesModal&&(
        <div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setNotesModal(null)}>
          <div className="modal" style={{maxWidth:420}}>
            <div className="mh">
              <div className="mt">Mark as Paid — {notesModal.unit.tenant||notesModal.unit.id}</div>
              <button className="mc" onClick={()=>setNotesModal(null)}>✕</button>
            </div>
            <div style={{padding:"20px 22px"}}>
              <div style={{fontSize:13,color:"var(--sub)",marginBottom:16}}>
                £{notesModal.unit.rent}/mo · {monthLabel(viewMonth)}
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,color:"var(--navy)",display:"block",marginBottom:6}}>Reference / Notes (optional)</label>
                <input
                  id="pay-notes-input"
                  autoFocus
                  placeholder="e.g. BACS ref 12345, cheque no. 001…"
                  style={{width:"100%",fontFamily:"var(--fb)",fontSize:13,padding:"8px 11px",border:"1.5px solid #D0DAE8",borderRadius:7,outline:"none",boxSizing:"border-box"}}
                  onKeyDown={e=>{if(e.key==="Enter"){const v=document.getElementById("pay-notes-input").value;const ca=notesModal.unit.status==="arrears"&&document.getElementById("clear-arrears-cb")?.checked;handleMarkPaid(notesModal.unit,{notes:v,clearArrears:ca});setNotesModal(null);}}}
                />
              </div>
              {notesModal.unit.status==="arrears"&&(
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,padding:"10px 12px",background:"#FFF8E1",border:"1.5px solid #FFD54F",borderRadius:7}}>
                  <input type="checkbox" id="clear-arrears-cb" defaultChecked={true} style={{width:15,height:15,cursor:"pointer"}}/>
                  <label htmlFor="clear-arrears-cb" style={{fontSize:13,color:"#7A5C00",cursor:"pointer",fontWeight:500}}>
                    Also clear arrears status (set back to Occupied)
                  </label>
                </div>
              )}
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button className="btn btn-outline" onClick={()=>setNotesModal(null)}>Cancel</button>
                <button className="btn btn-success" onClick={()=>{
                  const v=document.getElementById("pay-notes-input")?.value||"";
                  const clearArrears=notesModal.unit.status==="arrears"&&document.getElementById("clear-arrears-cb")?.checked;
                  handleMarkPaid(notesModal.unit, {notes:v, clearArrears});
                  setNotesModal(null);
                }}>✓ Confirm paid</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History modal */}
      {historyTenant&&(
        <div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setHistoryTenant(null)}>
          <div className="modal" style={{maxWidth:460}}>
            <div className="mh">
              <div className="mt">Payment History — {historyTenant.tenant||historyTenant.id}</div>
              <button className="mc" onClick={()=>setHistoryTenant(null)}>✕</button>
            </div>
            <div style={{padding:"16px 22px"}}>
              <div style={{fontSize:13,color:"var(--sub)",marginBottom:14}}>
                £{historyTenant.rent}/mo · {historyTenant.payment||"—"}
              </div>
              {historyLoading
                ? <div style={{textAlign:"center",padding:"24px 0",color:"var(--sub)"}}>Loading…</div>
                : history.length===0
                  ? <div style={{textAlign:"center",padding:"24px 0",color:"var(--sub)"}}>No payment records found</div>
                  : <table style={{width:"100%"}}>
                      <thead><tr><th>Month</th><th style={{textAlign:"right"}}>Amount</th><th>Date Paid</th><th>Reference</th></tr></thead>
                      <tbody>
                        {history.map(h=>(
                          <tr key={h.id}>
                            <td style={{fontWeight:600}}>{monthLabel(h.period_month)}</td>
                            <td style={{textAlign:"right"}}>£{(Number(h.amount)||0).toLocaleString()}</td>
                            <td style={{fontSize:12,color:"var(--sub)"}}>
                              {h.paid_at ? new Date(h.paid_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) : "—"}
                            </td>
                            <td style={{fontSize:12,color:"var(--sub)"}}>{h.notes||"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



// ─── Tasks / Jobs ─────────────────────────────────────────────────────────────
const TASK_CATEGORIES = ["Storage","Residential","Commercial","General"];
const TASK_PRIORITIES = ["Low","Medium","High","Urgent"];
const TASK_STATUSES = ["Open","In Progress","Done"];
const TASK_RECURRENCE = ["None","Weekly","Fortnightly","Monthly","Quarterly","Annually"];
const PRIORITY_COLOR = {Low:"#5A6E8A",Medium:"#C9A84C",High:"#E67E22",Urgent:"#C0392B"};
const PRIORITY_BG = {Low:"#F0F4FA",Medium:"#FFFBEA",High:"#FFF3E0",Urgent:"#FFF0EE"};

// ─── Login Log ───────────────────────────────────────────────────────────────
async function loginLogRecord(email, token){
  try{
    await fetch(`${SUPABASE_URL}/rest/v1/login_log`,{
      method:"POST",
      headers:{...authH(token),Prefer:"return=minimal"},
      body:JSON.stringify({email, logged_in_at: new Date().toISOString()})
    });
  }catch{}
}
async function loginLogList(token){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/login_log?order=logged_in_at.desc&limit=100`,{headers:authH(token)});
  return r.ok?r.json():[];
}

async function taskList(token, orgId){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tasks?org_id=eq.${orgId}&order=due_date.asc.nullslast,created_at.asc`,{headers:authH(token)});
  if(!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
async function taskSave(task,token){
  const clean={...task};
  if(!clean.due_date) clean.due_date=null;
  if(!clean.assigned_to) clean.assigned_to=null;
  if(!clean.linked_unit) clean.linked_unit=null;
  if(!clean.notes) clean.notes=null;
  if(!clean.category) clean.category=null;
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tasks`,{
    method:"POST",
    headers:{...authH(token),Prefer:"return=representation"},
    body:JSON.stringify(clean)
  });
  if(!r.ok){const b=await r.json();throw new Error(b?.message||b?.code||r.status);}
  return r.json();
}
async function taskUpdate(id,data,token){
  const clean={...data};
  if(clean.due_date==="") clean.due_date=null;
  if(clean.assigned_to==="") clean.assigned_to=null;
  if(clean.linked_unit==="") clean.linked_unit=null;
  if(clean.notes==="") clean.notes=null;
  await fetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${id}`,{
    method:"PATCH",
    headers:{...authH(token),Prefer:"return=minimal"},
    body:JSON.stringify(clean)
  });
}
async function taskDelete(id,token){
  await fetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${id}`,{
    method:"DELETE",headers:authH(token)
  });
}

function nextOccurrence(dueDate,recurrence){
  if(!dueDate||recurrence==="None") return null;
  const d=new Date(dueDate);
  if(recurrence==="Weekly") d.setDate(d.getDate()+7);
  else if(recurrence==="Fortnightly") d.setDate(d.getDate()+14);
  else if(recurrence==="Monthly") d.setMonth(d.getMonth()+1);
  else if(recurrence==="Quarterly") d.setMonth(d.getMonth()+3);
  else if(recurrence==="Annually") d.setFullYear(d.getFullYear()+1);
  return d.toISOString().slice(0,10);
}

const BLANK_TASK = {title:"",category:"General",priority:"Medium",assigned_to:"",due_date:"",recurrence:"None",reminder_days:7,notes:"",status:"Open"};

async function taskCommentList(taskId, token){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/task_comments?task_id=eq.${taskId}&order=created_at.asc`,{headers:authH(token)});
  return r.ok?r.json():[];
}
async function taskCommentSave(comment, token){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/task_comments`,{
    method:"POST",
    headers:{...authH(token),Prefer:"return=representation"},
    body:JSON.stringify(comment)
  });
  return r.ok?r.json():null;
}
async function uploadTaskPhoto(taskId, file, token){
  const ext=file.name.split(".").pop();
  const path=`tasks/${taskId}/${Date.now()}.${ext}`;
  const r=await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${path}`,{
    method:"POST",
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,Prefer:"return=representation","Content-Type":file.type},
    body:file
  });
  return r.ok?path:null;
}

const TASKS_SETUP_SQL = `create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  title text not null,
  category text,
  priority text default 'Medium',
  assigned_to text,
  due_date date,
  recurrence text default 'None',
  reminder_days integer default 7,
  notes text,
  status text default 'Open',
  linked_unit text,
  created_at timestamptz default now()
);
alter table tasks disable row level security;
grant select, insert, update, delete on table tasks to anon, authenticated;`;

function TasksPage({token,showToast,data=[],orgId,onAudit}){
  const [tasks,setTasks]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [editTask,setEditTask]=useState(null);
  const [form,setForm]=useState({...BLANK_TASK});
  const [saving,setSaving]=useState(false);
  const [filterStatus,setFilterStatus]=useState("active"); // active | done | all
  const [filterCat,setFilterCat]=useState("all");
  const [dbError,setDbError]=useState(false);
  const [workerView,setWorkerView]=useState(null);
  const [viewTask,setViewTask]=useState(null); // task detail/comments modal
  const [taskComments,setTaskComments]=useState([]); // comments for viewTask
  const [commentText,setCommentText]=useState("");
  const [addingComment,setAddingComment]=useState(false);
  const [doneModal,setDoneModal]=useState(null); // task being marked done - ask for completion note
  const [doneNote,setDoneNote]=useState("");
  const [selectedTasks,setSelectedTasks]=useState(new Set());
  const [viewMode,setViewMode]=useState("week"); // week | list

  const u=k=>e=>setForm(f=>({...f,[k]:e.target.value}));

  // Load comments when viewTask changes
  useEffect(()=>{
    if(!viewTask) return;
    taskCommentList(viewTask.id, token).then(c=>setTaskComments(Array.isArray(c)?c:[]));
  },[viewTask, token]);

  async function addComment(){
    if(!commentText.trim()) return;
    setAddingComment(true);
    const saved=await taskCommentSave({task_id:viewTask.id, comment:commentText, created_at:new Date().toISOString()}, token);
    const rec=Array.isArray(saved)?saved[0]:saved;
    if(rec?.id) setTaskComments(c=>[...c,rec]);
    setCommentText("");
    setAddingComment(false);
  }

  function toggleSelect(id){setSelectedTasks(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});}

  async function handleBulkDone(){
    if(selectedTasks.size===0) return;
    if(!window.confirm(`Mark ${selectedTasks.size} task${selectedTasks.size!==1?"s":""} as done?`)) return;
    for(const id of selectedTasks){
      const task=tasks.find(t=>t.id===id);
      if(task) await handleMarkDone(task, true); // silent=true
    }
    setSelectedTasks(new Set());
    showToast(`✅ ${selectedTasks.size} tasks marked as done`);
  }

  useEffect(()=>{
    if(!token || !orgId) return;
    taskList(token, orgId)
      .then(t=>{setTasks(Array.isArray(t)?t:[]);setDbError(false);setLoading(false);})
      .catch(()=>{setDbError(true);setTasks([]);setLoading(false);});
  },[token, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  function openAdd(){setForm({...BLANK_TASK});setEditTask(null);setShowForm(true);}
  function openEdit(t){setForm({...t});setEditTask(t);setShowForm(true);}

  async function handleSave(){
    if(!form.title.trim()){showToast("❌ Please enter a task title");return;}
    setSaving(true);
    try{
      if(editTask){
        await taskUpdate(editTask.id,form,token);
        setTasks(ts=>ts.map(t=>t.id===editTask.id?{...t,...form}:t));
        if(onAudit) onAudit("update","task",editTask.id,form.title,{priority:form.priority,status:form.status});
        showToast("✅ Task updated");
      } else {
        const saved=await taskSave({...form, org_id: orgId},token);
        const rec=Array.isArray(saved)?saved[0]:saved;
        if(rec?.id){
          setTasks(ts=>[...ts,rec]);
          if(onAudit) onAudit("create","task",rec.id,form.title,{priority:form.priority,due_date:form.due_date});
          showToast("✅ Task added");
        } else {showToast("❌ Could not save task — please try again");}
      }
      setShowForm(false);
    }catch(e){showToast("❌ Save failed: "+e.message);}
    setSaving(false);
  }

  async function handleMarkDone(task, silent=false){
    await taskUpdate(task.id,{status:"Done"},token);
    if(onAudit) onAudit("complete","task",task.id,task.title,{recurrence:task.recurrence});
    let updated=[...tasks.map(t=>t.id===task.id?{...t,status:"Done"}:t)];
    if(task.recurrence&&task.recurrence!=="None"&&task.due_date){
      const nextDate=nextOccurrence(task.due_date,task.recurrence);
      const nextTask={...task,status:"Open",due_date:nextDate,id:undefined,created_at:undefined};
      delete nextTask.id; delete nextTask.created_at;
      const saved=await taskSave({...nextTask, org_id: orgId},token);
      const rec=Array.isArray(saved)?saved[0]:saved;
      if(rec?.id){updated=[...updated,rec];if(!silent)showToast(`✅ Done · Next ${task.recurrence.toLowerCase()} task created for ${nextDate}`);}
    } else {
      if(!silent)showToast("✅ Task marked as done");
    }
    setTasks(updated);
  }

  async function handleMarkDoneWithNote(task, note){
    await handleMarkDone(task);
    if(note&&note.trim()){
      await taskCommentSave({task_id:task.id, comment:`✅ Completed: ${note}`, created_at:new Date().toISOString()}, token);
    }
    setDoneModal(null);
    setDoneNote("");
  }

  async function handleDelete(id){
    if(!window.confirm("Delete this task?")) return;
    const task = tasks.find(t=>t.id===id);
    await taskDelete(id,token);
    setTasks(ts=>ts.filter(t=>t.id!==id));
    if(onAudit) onAudit("delete","task",id,task?.title||id,{});
    showToast("🗑️ Task deleted");
  }

  async function handleReopen(task){
    await taskUpdate(task.id,{status:"Open"},token);
    setTasks(ts=>ts.map(t=>t.id===task.id?{...t,status:"Open"}:t));
    setFilterStatus("active");
    showToast("↩️ Task reopened");
  }

  const today=new Date(); today.setHours(0,0,0,0);
  function isOverdue(t){return t.due_date&&new Date(t.due_date)<today&&t.status!=="Done";}
  function isDueSoon(t){
    if(!t.due_date||t.status==="Done") return false;
    const d=new Date(t.due_date);
    const diff=Math.ceil((d-today)/86400000);
    return diff>=0&&diff<=(t.reminder_days||7);
  }

  let filtered=tasks.filter(t=>{
    if(filterStatus==="active") return t.status!=="Done";
    if(filterStatus==="done") return t.status==="Done";
    return true;
  });
  if(filterCat!=="all") filtered=filtered.filter(t=>t.category===filterCat);

  const openCount=tasks.filter(t=>t.status!=="Done").length;
  const overdueCount=tasks.filter(t=>isOverdue(t)).length;
  const dueSoonCount=tasks.filter(t=>isDueSoon(t)&&!isOverdue(t)).length;

  // Sort: overdue first, then by due date, then no date
  filtered=[
    ...filtered.filter(t=>isOverdue(t)).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date)),
    ...filtered.filter(t=>!isOverdue(t)&&t.due_date).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date)),
    ...filtered.filter(t=>!t.due_date),
  ];

  // Get unit names for linked unit dropdown
  const unitOptions=data.filter(u=>u.id).sort((a,b)=>(a.id||"").localeCompare(b.id||""));

  return(
    <div>
      {dbError&&(
        <div style={{background:"#FFF8E1",border:"1.5px solid #FFD54F",borderRadius:8,padding:"14px 18px",marginBottom:18,fontSize:13,color:"#5D4037"}}>
          <strong>⚙️ One-time setup required</strong> — Run this SQL in your <a href="https://supabase.com/dashboard/project/lbealsgloqoepazfrgbj/sql/new" target="_blank" rel="noreferrer" style={{color:"var(--navy)"}}>Supabase SQL editor</a>:<br/><br/>
          <code style={{display:"block",background:"#F5F5F5",padding:"10px 12px",borderRadius:6,fontSize:12,fontFamily:"monospace",whiteSpace:"pre-wrap"}}>{TASKS_SETUP_SQL}</code>
        </div>
      )}

      {/* Summary row */}
      <div className="kg" style={{gridTemplateColumns:"repeat(3,1fr)",marginBottom:20}}>
        <div className="kc">
          <div className="kl">Open Tasks</div>
          <div className="kv">{openCount}</div>
          <div className="ks">{tasks.length} total</div>
        </div>
        <div className="kc" style={{background:overdueCount>0?PRIORITY_BG.Urgent:""}}>
          <div className="kl">Overdue</div>
          <div className="kv" style={{color:overdueCount>0?PRIORITY_COLOR.Urgent:""}}>{overdueCount}</div>
          <div className="ks">Past due date</div>
        </div>
        <div className="kc" style={{background:dueSoonCount>0?PRIORITY_BG.High:""}}>
          <div className="kl">Due Soon</div>
          <div className="kv" style={{color:dueSoonCount>0?PRIORITY_COLOR.High:""}}>{dueSoonCount}</div>
          <div className="ks">Within reminder window</div>
        </div>
      </div>

      {/* View mode + Filters + Add */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <button className={`btn btn-sm ${viewMode==="week"?"btn-primary":"btn-outline"}`} onClick={()=>setViewMode("week")}>📅 This Week</button>
        <button className={`btn btn-sm ${viewMode==="list"?"btn-primary":"btn-outline"}`} onClick={()=>setViewMode("list")}>☰ All Tasks</button>
        <div style={{width:1,height:20,background:"#E4EAF2",margin:"0 4px"}}/>
        {viewMode==="list"&&["active","done","all"].map(s=>(
          <button key={s} className={`btn btn-sm ${filterStatus===s?"btn-primary":"btn-outline"}`} onClick={()=>setFilterStatus(s)}>
            {s==="active"?"Open":s==="done"?"Done":"All"}
          </button>
        ))}
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{fontSize:12,padding:"5px 10px",border:"1px solid #D0DAE8",borderRadius:7,fontFamily:"var(--fb)"}}>
          <option value="all">All categories</option>
          {TASK_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        {selectedTasks.size>0&&(
          <button className="btn btn-success btn-sm" onClick={handleBulkDone}>✓ Done ({selectedTasks.size})</button>
        )}
        {selectedTasks.size>0&&(
          <button className="btn btn-outline btn-sm" onClick={()=>setSelectedTasks(new Set())}>✕ Clear</button>
        )}
        <button className="btn btn-primary btn-sm" style={{marginLeft:"auto"}} onClick={openAdd}>+ Add Task</button>
      </div>

      {/* This Week view */}
      {viewMode==="week"&&(()=>{
        const tod=new Date();tod.setHours(0,0,0,0);
        const days=[];
        for(let i=0;i<7;i++){const d=new Date(tod);d.setDate(d.getDate()+i);days.push(d);}
        const overdue=tasks.filter(t=>t.status!=="Done"&&t.due_date&&new Date(t.due_date)<tod);
        return(
          <div>
            {overdue.length>0&&(
              <div className="card" style={{marginBottom:12,border:"1.5px solid #FFCDD2"}}>
                <div className="ch" style={{background:"#FFF0EE"}}>
                  <div className="ct" style={{color:"var(--danger)"}}>⚠️ Overdue ({overdue.length})</div>
                </div>
                {overdue.map(task=>{
                  return(
                    <div key={task.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"11px 16px",borderBottom:"1px solid #FFCDD2"}}>
                      <div style={{flexShrink:0}}><button className="btn btn-success btn-sm" onClick={()=>{setDoneModal(task);setDoneNote("");}}>✓ Done</button></div>
                      <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>{setViewTask(task);setCommentText("");}}>
                        <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{task.title}</div>
                        <div style={{fontSize:11,color:"var(--danger)"}}>📅 Was due: {new Date(task.due_date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})} {task.assigned_to&&`· 👤 ${task.assigned_to}`}</div>
                      </div>
                      <button className="btn btn-outline btn-sm" onClick={e=>{e.stopPropagation();openEdit(task);}}>Edit</button>
                    </div>
                  );
                })}
              </div>
            )}
            {days.map(day=>{
              const ds=day.toISOString().slice(0,10);
              const dayTasks=tasks.filter(t=>t.status!=="Done"&&t.due_date===ds);
              const isToday=ds===tod.toISOString().slice(0,10);
              return(
                <div key={ds} className="card" style={{marginBottom:10,opacity:dayTasks.length===0?0.5:1}}>
                  <div className="ch" style={{background:isToday?"#EEF4FF":"",paddingBottom:dayTasks.length===0?14:0}}>
                    <div className="ct" style={{color:isToday?"var(--navy)":"var(--text)",fontSize:13}}>
                      {isToday?"Today — ":""}{day.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short"})}
                    </div>
                    {dayTasks.length===0&&<span style={{fontSize:12,color:"var(--sub)"}}>No tasks</span>}
                  </div>
                  {dayTasks.map(task=>{
                  const overdue=isOverdue(task);
                  const soon=isDueSoon(task)&&!overdue;
                  return(
                    <div key={task.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"11px 16px",borderBottom:"1px solid #F0F4FA",background:overdue?PRIORITY_BG.Urgent:soon?PRIORITY_BG.High:""}}>
                      <div style={{flexShrink:0}}>
                        <button className="btn btn-success btn-sm" onClick={()=>{setDoneModal(task);setDoneNote("");}}>✓ Done</button>
                      </div>
                      <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>{setViewTask(task);setCommentText("");}}>
                        <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{task.title}</div>
                        <div style={{fontSize:11,color:"var(--sub)",display:"flex",gap:10,flexWrap:"wrap"}}>
                          <span style={{fontSize:10,padding:"2px 7px",borderRadius:99,background:PRIORITY_BG[task.priority],color:PRIORITY_COLOR[task.priority],fontWeight:600}}>{task.priority}</span>
                          {task.assigned_to&&<span style={{cursor:"pointer",color:"var(--navy)",fontWeight:500,textDecoration:"underline"}} onClick={e=>{e.stopPropagation();setWorkerView(task.assigned_to);}}>👤 {task.assigned_to}</span>}
                          {task.linked_unit&&<span>📦 Unit {task.linked_unit}</span>}
                          {task.recurrence&&task.recurrence!=="None"&&<span>🔁 {task.recurrence}</span>}
                        </div>
                      </div>
                      <button className="btn btn-outline btn-sm" onClick={e=>{e.stopPropagation();openEdit(task);}}>Edit</button>
                    </div>
                  );
                })}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Task list (list mode) */}
      {viewMode==="list"&&<div className="card">
        {loading&&<div style={{padding:24,textAlign:"center",color:"var(--sub)"}}>Loading…</div>}
        {!loading&&filtered.length===0&&(
          <div style={{padding:32,textAlign:"center",color:"var(--sub)"}}>
            <div style={{fontSize:32,marginBottom:8}}>✅</div>
            {filterStatus==="active"?"No open tasks — all clear!":"No tasks found"}
          </div>
        )}
        {!loading&&filtered.map(task=>{
          const overdue=isOverdue(task);
          const soon=isDueSoon(task)&&!overdue;
          const done=task.status==="Done";
          return(
            <div key={task.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"13px 16px",borderBottom:"1px solid #F0F4FA",background:overdue?PRIORITY_BG.Urgent:soon?PRIORITY_BG.High:done?"#FAFAFA":"",opacity:done?0.7:1}}>
              {!done&&<input type="checkbox" checked={selectedTasks.has(task.id)} onChange={()=>toggleSelect(task.id)} style={{marginTop:4,cursor:"pointer"}}/>}
              {done&&<div style={{width:16}}/>}
              <div style={{flexShrink:0}}>
                {done
                  ?<button className="btn btn-outline btn-sm" onClick={()=>handleReopen(task)}>↩ Reopen</button>
                  :<button className="btn btn-success btn-sm" onClick={()=>{setDoneModal(task);setDoneNote("");}}>✓ Done</button>
                }
              </div>
              <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>{setViewTask(task);setCommentText("");}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:3}}>
                  <span style={{fontSize:13,fontWeight:done?400:600,color:done?"var(--sub)":"var(--text)",textDecoration:done?"line-through":"none"}}>{task.title}</span>
                  <span style={{fontSize:10,padding:"2px 7px",borderRadius:99,background:PRIORITY_BG[task.priority]||"#F0F4FA",color:PRIORITY_COLOR[task.priority]||"var(--sub)",fontWeight:600}}>{task.priority}</span>
                  <span style={{fontSize:10,padding:"2px 7px",borderRadius:99,background:"#F0F4FA",color:"var(--sub)"}}>{task.category}</span>
                  {task.recurrence&&task.recurrence!=="None"&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:99,background:"#EEF4FF",color:"#3B5FA0"}}>🔁 {task.recurrence}</span>}
                </div>
                <div style={{fontSize:11,color:"var(--sub)",display:"flex",gap:10,flexWrap:"wrap"}}>
                  {task.due_date&&<span style={{color:overdue?"var(--danger)":soon?PRIORITY_COLOR.High:"var(--sub)",fontWeight:overdue||soon?600:400}}>📅 {overdue?"Overdue: ":soon?"Due soon: ":"Due: "}{new Date(task.due_date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</span>}
                  {task.assigned_to&&<span style={{cursor:"pointer",color:"var(--navy)",fontWeight:500,textDecoration:"underline"}} onClick={e=>{e.stopPropagation();setWorkerView(task.assigned_to);}}>👤 {task.assigned_to}</span>}
                  {task.linked_unit&&<span>📦 Unit {task.linked_unit}</span>}
                  {task.notes&&<span style={{maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>💬 {task.notes}</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button className="btn btn-outline btn-sm" onClick={e=>{e.stopPropagation();openEdit(task);}}>Edit</button>
                <button className="btn btn-outline btn-sm" style={{color:"var(--danger)"}} onClick={e=>{e.stopPropagation();handleDelete(task.id);}}>🗑️</button>
              </div>
            </div>
          );
        })}
      </div>}

      {/* Worker View Modal */}
      {workerView&&(()=>{
        const workerTasks=tasks.filter(t=>t.assigned_to===workerView);
        const open=workerTasks.filter(t=>t.status!=="Done");
        const done=workerTasks.filter(t=>t.status==="Done");
        const today=new Date();today.setHours(0,0,0,0);
        return(
          <div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setWorkerView(null)}>
            <div className="modal" style={{maxWidth:660,maxHeight:"85vh",display:"flex",flexDirection:"column"}}>
              <div className="mh" style={{flexShrink:0}}>
                <div className="mt">👤 {workerView}</div>
                <div style={{display:"flex",gap:8}}>
                  <button className="btn btn-outline btn-sm" onClick={()=>{
                    const el=document.getElementById("worker-print-area");
                    if(!el) return;
                    const w=window.open("","_blank");
                    w.document.write(`<html><head><title>Tasks — ${workerView}</title><style>
                      body{font-family:Arial,sans-serif;padding:24px;color:#0B1E3D}
                      h1{font-size:18px;margin-bottom:4px}
                      h2{font-size:13px;color:#5A6E8A;font-weight:normal;margin-bottom:20px}
                      h3{font-size:13px;margin:16px 0 8px;border-bottom:1px solid #eee;padding-bottom:4px}
                      .task{padding:8px 0;border-bottom:1px solid #f0f0f0}
                      .title{font-size:13px;font-weight:600;margin-bottom:3px}
                      .meta{font-size:11px;color:#5A6E8A}
                      .badge{display:inline-block;padding:1px 7px;border-radius:99px;font-size:10px;font-weight:600;margin-right:6px}
                      @media print{body{padding:0}}
                    </style></head><body>`);
                    w.document.write(`<h1>Tasks — ${workerView}</h1>`);
                    w.document.write(`<h2>Printed ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</h2>`);
                    if(open.length>0){
                      w.document.write("<h3>Open Tasks</h3>");
                      open.forEach(t=>{
                        const overdue=t.due_date&&new Date(t.due_date)<today;
                        w.document.write(`<div class="task"><div class="title">${t.title}</div><div class="meta">${t.priority} · ${t.category}${t.due_date?" · Due: "+new Date(t.due_date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})+(overdue?" (OVERDUE)":""):""}${t.linked_unit?" · Unit "+t.linked_unit:""}${t.recurrence&&t.recurrence!=="None"?" · "+t.recurrence:""}${t.notes?"<br>"+t.notes:""}</div></div>`);
                      });
                    }
                    if(done.length>0){
                      w.document.write("<h3>Completed Tasks</h3>");
                      done.forEach(t=>{
                        w.document.write(`<div class="task"><div class="title" style="text-decoration:line-through;color:#888">${t.title}</div><div class="meta">${t.category}${t.linked_unit?" · Unit "+t.linked_unit:""}</div></div>`);
                      });
                    }
                    w.document.write("</body></html>");
                    w.document.close();
                    setTimeout(()=>w.print(),500);
                  }}>🖨️ Print PDF</button>
                  <button className="mc" onClick={()=>setWorkerView(null)}>✕</button>
                </div>
              </div>
              <div id="worker-print-area" style={{overflowY:"auto",flex:1,padding:"16px 22px"}}>
                {/* Summary */}
                <div style={{display:"flex",gap:16,marginBottom:20}}>
                  <div className="kc" style={{flex:1,padding:"10px 14px"}}>
                    <div className="kl">Open</div>
                    <div className="kv" style={{fontSize:22}}>{open.length}</div>
                  </div>
                  <div className="kc" style={{flex:1,padding:"10px 14px"}}>
                    <div className="kl">Completed</div>
                    <div className="kv" style={{fontSize:22}}>{done.length}</div>
                  </div>
                  <div className="kc" style={{flex:1,padding:"10px 14px"}}>
                    <div className="kl">Overdue</div>
                    <div className="kv" style={{fontSize:22,color:workerTasks.filter(t=>t.due_date&&new Date(t.due_date)<today&&t.status!=="Done").length>0?"var(--danger)":""}}>
                      {workerTasks.filter(t=>t.due_date&&new Date(t.due_date)<today&&t.status!=="Done").length}
                    </div>
                  </div>
                </div>
                {/* Open tasks */}
                {open.length>0&&(
                  <>
                    <div style={{fontWeight:600,fontSize:12,color:"var(--sub)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Open Tasks</div>
                    {open.map(t=>{
                      const overdue=t.due_date&&new Date(t.due_date)<today;
                      return(
                        <div key={t.id} style={{padding:"10px 0",borderBottom:"1px solid #F0F4FA"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                            <span style={{fontSize:13,fontWeight:600}}>{t.title}</span>
                            <span style={{fontSize:10,padding:"2px 7px",borderRadius:99,background:PRIORITY_BG[t.priority],color:PRIORITY_COLOR[t.priority],fontWeight:600}}>{t.priority}</span>
                            <span style={{fontSize:10,padding:"2px 7px",borderRadius:99,background:"#F0F4FA",color:"var(--sub)"}}>{t.category}</span>
                            {t.recurrence&&t.recurrence!=="None"&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:99,background:"#EEF4FF",color:"#3B5FA0"}}>🔁 {t.recurrence}</span>}
                          </div>
                          <div style={{fontSize:11,color:"var(--sub)",display:"flex",gap:10,flexWrap:"wrap"}}>
                            {t.due_date&&<span style={{color:overdue?"var(--danger)":"var(--sub)",fontWeight:overdue?600:400}}>📅 {overdue?"Overdue: ":""}{new Date(t.due_date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</span>}
                            {t.linked_unit&&<span>📦 Unit {t.linked_unit}</span>}
                            {t.notes&&<span>💬 {t.notes}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                {/* Done tasks */}
                {done.length>0&&(
                  <>
                    <div style={{fontWeight:600,fontSize:12,color:"var(--sub)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8,marginTop:20}}>Completed</div>
                    {done.map(t=>(
                      <div key={t.id} style={{padding:"8px 0",borderBottom:"1px solid #F0F4FA",opacity:0.6}}>
                        <div style={{fontSize:13,textDecoration:"line-through",color:"var(--sub)"}}>{t.title}</div>
                        <div style={{fontSize:11,color:"var(--sub)"}}>{t.category}{t.linked_unit?` · Unit ${t.linked_unit}`:""}</div>
                      </div>
                    ))}
                  </>
                )}
                {workerTasks.length===0&&(
                  <div style={{textAlign:"center",color:"var(--sub)",padding:"32px 0"}}>No tasks assigned to {workerView}</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Done with note modal */}
      {doneModal&&(
        <div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setDoneModal(null)}>
          <div className="modal" style={{maxWidth:440}}>
            <div className="mh">
              <div className="mt">✓ Mark as Done — {doneModal.title}</div>
              <button className="mc" onClick={()=>setDoneModal(null)}>✕</button>
            </div>
            <div style={{padding:"18px 22px"}}>
              <div className="fgi full" style={{marginBottom:14}}>
                <label>Completion note (optional)</label>
                <textarea autoFocus value={doneNote} onChange={e=>setDoneNote(e.target.value)} rows={3}
                  placeholder="e.g. Mowed top field, bottom field needs attention next time…"
                  onKeyDown={e=>{if(e.key==="Enter"&&e.metaKey){handleMarkDoneWithNote(doneModal,doneNote);}}}
                />
              </div>
              {doneModal.recurrence&&doneModal.recurrence!=="None"&&(
                <div style={{fontSize:12,color:"#3B5FA0",background:"#EEF4FF",padding:"8px 12px",borderRadius:7,marginBottom:14}}>
                  🔁 Next {doneModal.recurrence.toLowerCase()} task will be created automatically
                </div>
              )}
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button className="btn btn-outline" onClick={()=>handleMarkDoneWithNote(doneModal,"")}>Done (no note)</button>
                <button className="btn btn-success" onClick={()=>handleMarkDoneWithNote(doneModal,doneNote)}>✓ Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task detail / comments modal */}
      {viewTask&&(
        <div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setViewTask(null)}>
          <div className="modal" style={{maxWidth:540,maxHeight:"85vh",display:"flex",flexDirection:"column"}}>
            <div className="mh" style={{flexShrink:0}}>
              <div>
                <div className="mt">{viewTask.title}</div>
                <div style={{fontSize:11,color:"var(--sub)",marginTop:2}}>
                  {viewTask.category} · {viewTask.priority}
                  {viewTask.assigned_to&&` · 👤 ${viewTask.assigned_to}`}
                  {viewTask.linked_unit&&` · 📦 Unit ${viewTask.linked_unit}`}
                  {viewTask.due_date&&` · 📅 ${new Date(viewTask.due_date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}`}
                  {viewTask.recurrence&&viewTask.recurrence!=="None"&&` · 🔁 ${viewTask.recurrence}`}
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button className="btn btn-outline btn-sm" onClick={()=>{openEdit(viewTask);setViewTask(null);}}>Edit</button>
                <button className="mc" onClick={()=>setViewTask(null)}>✕</button>
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"16px 22px"}}>
              {/* Task notes */}
              {viewTask.notes&&(
                <div style={{background:"#F8FAFC",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13,color:"var(--text)"}}>
                  {viewTask.notes}
                </div>
              )}
              {/* Photo upload */}
              <div style={{marginBottom:16}}>
                <label style={{fontSize:12,fontWeight:600,color:"var(--sub)",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:8}}>Photos</label>
                <label style={{cursor:"pointer"}}>
                  <input type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{
                    const file=e.target.files[0];
                    if(!file) return;
                    showToast("⏳ Uploading photo…");
                    const path=await uploadTaskPhoto(viewTask.id,file,token);
                    if(path){
                      const comment=`📷 Photo attached: ${file.name}`;
                      const saved=await taskCommentSave({task_id:viewTask.id,comment,created_at:new Date().toISOString()},token);
                      const rec=Array.isArray(saved)?saved[0]:saved;
                      if(rec?.id) setTaskComments(c=>[...c,rec]);
                      showToast("✅ Photo uploaded");
                    } else {
                      showToast("❌ Photo upload failed");
                    }
                    e.target.value="";
                  }}/>
                  <span className="btn btn-outline btn-sm">📷 Attach photo</span>
                </label>
              </div>
              {/* Comments / updates log */}
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"var(--sub)",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:8}}>Updates & Notes</label>
                {taskComments.length===0&&<div style={{fontSize:12,color:"var(--sub)",marginBottom:12}}>No updates yet</div>}
                {taskComments.map((c,i)=>(
                  <div key={i} style={{padding:"8px 0",borderBottom:"1px solid #F0F4FA"}}>
                    <div style={{fontSize:13,color:"var(--text)"}}>{c.comment}</div>
                    <div style={{fontSize:10,color:"var(--sub)",marginTop:2}}>{new Date(c.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})} · {new Date(c.created_at).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</div>
                  </div>
                ))}
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <input value={commentText} onChange={e=>setCommentText(e.target.value)}
                    placeholder="Add an update or note…"
                    style={{flex:1,fontFamily:"var(--fb)",fontSize:13,padding:"7px 11px",border:"1.5px solid #D0DAE8",borderRadius:7,outline:"none"}}
                    onKeyDown={e=>{if(e.key==="Enter")addComment();}}
                  />
                  <button className="btn btn-primary btn-sm" onClick={addComment} disabled={addingComment||!commentText.trim()}>Add</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm&&(
        <div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div className="modal" style={{maxWidth:520}}>
            <div className="mh">
              <div className="mt">{editTask?"Edit Task":"Add Task"}</div>
              <button className="mc" onClick={()=>setShowForm(false)}>✕</button>
            </div>
            <div style={{padding:"18px 22px",display:"flex",flexDirection:"column",gap:12}}>
              <div className="fgi full">
                <label>Task Title *</label>
                <input autoFocus value={form.title} onChange={u("title")} placeholder="e.g. Mow grass, Check fire alarms…"/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div className="fgi">
                  <label>Category</label>
                  <select value={form.category} onChange={u("category")}>
                    {TASK_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="fgi">
                  <label>Priority</label>
                  <select value={form.priority} onChange={u("priority")}>
                    {TASK_PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="fgi">
                  <label>Due Date</label>
                  <input type="date" value={form.due_date||""} onChange={u("due_date")}/>
                </div>
                <div className="fgi">
                  <label>Assigned To</label>
                  <input value={form.assigned_to||""} onChange={u("assigned_to")} placeholder="Name or leave blank"/>
                </div>
                <div className="fgi">
                  <label>Recurrence</label>
                  <select value={form.recurrence||"None"} onChange={u("recurrence")}>
                    {TASK_RECURRENCE.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="fgi">
                  <label>Remind me (days before)</label>
                  <select value={form.reminder_days??7} onChange={e=>setForm(f=>({...f,reminder_days:Number(e.target.value)}))}>
                    <option value={0}>On the day</option>
                    {[1,3,7,14,30].map(d=><option key={d} value={d}>{d} day{d!==1?"s":""} before</option>)}
                  </select>
                </div>
                <div className="fgi" style={{position:"relative"}}>
                  <label>Linked Unit (optional)</label>
                  <input
                    value={form.linked_unit||""}
                    onChange={u("linked_unit")}
                    placeholder="Type unit ID or tenant name…"
                    list="unit-options-list"
                  />
                  <datalist id="unit-options-list">
                    {unitOptions.map(d=>(
                      <option key={d.id} value={d.id}>{d.label||d.id}{d.tenant?` · ${d.tenant}`:""}</option>
                    ))}
                  </datalist>
                  {form.linked_unit&&(
                    <span style={{position:"absolute",right:8,top:30,fontSize:11,color:"var(--sub)"}}>
                      {unitOptions.find(d=>d.id===form.linked_unit)?.tenant||""}
                    </span>
                  )}
                </div>
                <div className="fgi">
                  <label>Status</label>
                  <select value={form.status||"Open"} onChange={u("status")}>
                    {TASK_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="fgi full">
                <label>Notes</label>
                <textarea value={form.notes||""} onChange={u("notes")} rows={3} placeholder="Any additional details…"/>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:4}}>
                <button className="btn btn-outline" onClick={()=>setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?"Saving…":editTask?"Save Changes":"Add Task"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Calendar Page ────────────────────────────────────────────────────────────
function CalendarPage({data, enquiries=[], tasks=[]}){
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState(null);

  function prevMonth(){
    if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}
    else setViewMonth(m=>m-1);
  }
  function nextMonth(){
    if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}
    else setViewMonth(m=>m+1);
  }

  const monthLabel = new Date(viewYear,viewMonth,1).toLocaleString("en-GB",{month:"long",year:"numeric"});

  // Build events map: key = "YYYY-MM-DD", value = [{type, label, color, unit}]
  const events = {};
  function addEvent(dateStr, event){
    if(!dateStr) return;
    const d = dateStr.slice(0,10);
    if(!d || d.length < 10) return;
    if(!events[d]) events[d]=[];
    events[d].push(event);
  }

  data.forEach(u=>{
    if(!u.id) return;
    const name = u.tenant||u.label||u.id;
    // Move-in dates
    if(u.move_in_date) addEvent(u.move_in_date,{type:"move_in",label:`Move-in: ${name}`,color:"#1A7F5A",unit:u.id});
    // Move-out dates
    if(u.move_out_date) addEvent(u.move_out_date,{type:"move_out",label:`Move-out: ${name}`,color:"#C0392B",unit:u.id});
    // Lease review dates (Residential/Commercial only)
    if(u.review && u.category!=="Storage"){
      const d = u.review.length===10 ? u.review : null;
      if(d) addEvent(d,{type:"review",label:`Review: ${name}`,color:"#C9A84C",unit:u.id});
    }
  });

  // CRM follow-up dates
  enquiries.forEach(e=>{
    if(e.follow_up_date && e.status!=="archived" && e.status!=="converted"){
      addEvent(e.follow_up_date,{type:"followup",label:`Follow-up: ${e.name}`,color:"#7B3FA0",unit:null});
    }
  });

  // Tasks due dates
  tasks.forEach(t=>{
    if(t.due_date && t.status!=="Done"){
      const col=t.priority==="Urgent"?"#C0392B":t.priority==="High"?"#E67E22":"#E8901A";
      addEvent(t.due_date,{type:"task",label:`🔧 ${t.title}`,color:col,unit:t.linked_unit||null});
    }
  });

  // Calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const startOffset = (firstDay+6)%7; // Monday-first offset
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
  const todayStr = now.toISOString().slice(0,10);

  const cells = [];
  for(let i=0;i<startOffset;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);
  // Pad to complete last row
  while(cells.length%7!==0) cells.push(null);

  const dayKeys = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  function dateStr(day){
    if(!day) return null;
    return `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }

  const selectedEvents = selectedDay ? (events[dateStr(selectedDay)]||[]) : [];

  // Event type legend
  const legend = [
    {color:"#1A7F5A",label:"Move-in"},
    {color:"#C0392B",label:"Move-out"},
    {color:"#C9A84C",label:"Lease review"},
    {color:"#7B3FA0",label:"CRM follow-up"},
    {color:"#E8901A",label:"Task due"},
  ];

  return(
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button className="btn btn-outline btn-sm" onClick={prevMonth}>← Prev</button>
          <div style={{fontFamily:"var(--fh)",fontSize:20,fontWeight:700,color:"var(--navy)",minWidth:200,textAlign:"center"}}>{monthLabel}</div>
          <button className="btn btn-outline btn-sm" onClick={nextMonth}>Next →</button>
        </div>
        <button className="btn btn-outline btn-sm" onClick={()=>{setViewYear(now.getFullYear());setViewMonth(now.getMonth());setSelectedDay(null);}}>Today</button>
      </div>

      {/* Legend */}
      <div style={{display:"flex",gap:16,marginBottom:16,flexWrap:"wrap"}}>
        {legend.map(l=>(
          <div key={l.label} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--sub)"}}>
            <div style={{width:10,height:10,borderRadius:2,background:l.color,flexShrink:0}}/>
            {l.label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="card" style={{overflow:"hidden"}}>
        {/* Day headers */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:"1px solid #E4EAF2"}}>
          {dayKeys.map(d=>(
            <div key={d} style={{padding:"8px 0",textAlign:"center",fontSize:11,fontWeight:600,color:"var(--sub)",textTransform:"uppercase",letterSpacing:"0.05em"}}>
              {d}
            </div>
          ))}
        </div>
        {/* Day cells */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
          {cells.map((day,i)=>{
            const ds = dateStr(day);
            const dayEvents = ds ? (events[ds]||[]) : [];
            const isToday = ds===todayStr;
            const isSelected = day===selectedDay;
            return(
              <div key={i} onClick={()=>day&&setSelectedDay(day===selectedDay?null:day)}
                style={{
                  minHeight:80,padding:"6px 8px",
                  borderRight:i%7!==6?"1px solid #E4EAF2":"none",
                  borderBottom:"1px solid #E4EAF2",
                  background:isSelected?"#EEF4FF":isToday?"#F8FAFF":"",
                  cursor:day?"pointer":"default",
                  opacity:day?1:0.3,
                }}>
                {day&&(
                  <>
                    <div style={{
                      fontSize:12,fontWeight:isToday?700:500,
                      color:isToday?"var(--navy)":"var(--text)",
                      marginBottom:4,
                      ...(isToday?{
                        background:"var(--navy)",color:"#fff",
                        width:22,height:22,borderRadius:"50%",
                        display:"flex",alignItems:"center",justifyContent:"center",
                      }:{})
                    }}>{day}</div>
                    {dayEvents.slice(0,3).map((e,j)=>(
                      <div key={j} style={{
                        fontSize:10,padding:"1px 5px",borderRadius:3,marginBottom:2,
                        background:e.color+"22",color:e.color,fontWeight:500,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"
                      }} title={e.label}>{e.label}</div>
                    ))}
                    {dayEvents.length>3&&(
                      <div style={{fontSize:10,color:"var(--sub)",paddingLeft:5}}>+{dayEvents.length-3} more</div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail panel */}
      {selectedDay&&(
        <div className="card" style={{marginTop:16}}>
          <div className="ch">
            <div className="ct">
              {new Date(viewYear,viewMonth,selectedDay).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
            </div>
            <button className="btn btn-outline btn-sm" onClick={()=>setSelectedDay(null)}>✕</button>
          </div>
          {selectedEvents.length===0?(
            <div style={{padding:"20px",textAlign:"center",color:"var(--sub)",fontSize:13}}>No events on this day</div>
          ):(
            <div style={{padding:"0 0 8px"}}>
              {selectedEvents.map((e,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 18px",borderBottom:"1px solid #F0F4FA"}}>
                  <div style={{width:4,height:36,borderRadius:2,background:e.color,flexShrink:0}}/>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{e.label}</div>
                    <div style={{fontSize:11,color:"var(--sub)",marginTop:2}}>
                      {e.type==="move_in"&&"Tenant move-in"}
                      {e.type==="move_out"&&"Tenant move-out"}
                      {e.type==="review"&&"Lease review due"}
                      {e.type==="followup"&&"CRM follow-up reminder"}
                      {e.type==="task"&&"Task due"}
                      {e.unit&&` · Unit ${e.unit}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Import / Export ──────────────────────────────────────────────────────────
function DataTools({data,onImport,token,showToast,orgId}){

  // ── Export matching original spreadsheet format exactly ───────────────────
  function exportOriginal(){
    const wb=XLSX.utils.book_new();
    const rows=[];
    // Row 1 - header info
    rows.push([new Date().toLocaleDateString("en-GB"),null,null,null,null,null,null,null,"Invoicing",null,null,"FOB ",null,null,"Invoice ","Gate",null,null,"Price Update Email Sent","Invoice & DD"]);
    // Row 2 - blank
    rows.push([null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]);
    // Row 3 - column headers
    rows.push([null,"Status",null,"Box No."," Size","Start Date","Tenant","SO/DD","Yes/No","Lock Deposit","Key No.","Deposit","£ per Week","£ per Month","Inc.Vat"," Code",null,null,null,null,"Email 1","Contact Number/Alternative Contact","Next Review"]);

    const statusToOrig={occupied:"Occupied",arrears:"In arrears",leaving:"Leaving",new:"New Customer",pending:"Pending",available:"Available"};

    function addSection(name, items){
      rows.push([name,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]);
      items.forEach(d=>{
        const rent=d.rent||null;
        const weeklyRent=rent?(rent*12)/52:null;
        rows.push([
          d.label||d.id,
          statusToOrig[d.status]||d.status,
          d.section||null,
          d.box_no||null,
          d.size||null,
          d.review||null,
          d.tenant||null,
          d.payment||null,
          null,null,null,null,
          weeklyRent?Math.round(weeklyRent*100)/100:null,
          rent,
          d.vat_rent||null,
          null,null,
          d.tenant||null,
          null,null,
          d.email||null,
          d.phone||null,
          d.review||null,
        ]);
      });
    }

    // Residential
    addSection("Residential", data.filter(d=>d.category==="Residential"));
    // Commercial
    addSection("Commercial", data.filter(d=>d.category==="Commercial"));
    // Storage rows in order
    const storRows=[...new Set(data.filter(d=>d.category==="Storage").map(d=>d.row_name).filter(Boolean))];
    storRows.forEach(r=>addSection(r, data.filter(d=>d.category==="Storage"&&d.row_name===r)));
    // Cow Shed
    // Cow Shed is now a regular Storage area — exported with other rows above

    // Legend rows at bottom
    rows.push([null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]);
    rows.push([null,"In arrears",null,null,null,null,null,null,null,null,"Total ",null,null,null,null,null,null,null,null,null,null,null,null]);
    rows.push([null,"Leaving"]);
    rows.push([null,"New Customer"]);
    rows.push([null,"Pending"]);
    rows.push([null,"Available"]);

    const ws=XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"]=[{wch:10},{wch:14},{wch:8},{wch:10},{wch:10},{wch:18},{wch:32},{wch:12},{wch:8},{wch:12},{wch:8},{wch:8},{wch:12},{wch:12},{wch:10},{wch:8},{wch:8},{wch:32},{wch:6},{wch:10},{wch:32},{wch:22},{wch:18}];
    XLSX.utils.book_append_sheet(wb,ws,"Tenant Schedule");
    XLSX.writeFile(wb,`Storage_Schedule_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  async function fullBackup(){
    if(!token){showToast("❌ Not logged in");return;}
    if(!window.confirm("This will create a single zip file containing all tenant data and documents.\n\nThis may take a minute depending on how many documents you have.\n\nStart backup?")) return;
    showToast("⏳ Preparing backup — please wait…");
    try{
      // Load JSZip via script tag if not already loaded
      if(!window.JSZip){
        await new Promise((resolve,reject)=>{
          const s=document.createElement("script");
          s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
          s.onload=resolve;
          s.onerror=reject;
          document.head.appendChild(s);
        });
      }
      const zip=new window.JSZip();

      // Step 1 — add Excel data file
      const rows=data.map(d=>({"Unit ID":d.id,"Property/Label":d.label||"","Category":d.category,"Tenant":d.tenant||"","Address":d.address||"","Email":d.email||"","Phone":d.phone||"","Payment Method":d.payment||"","Rent Ex-VAT":d.rent||"","Rent Inc-VAT":d.vat_rent||"","Status":SL[d.status]||d.status,"Lock Deposit Paid":d.lock_deposit_paid||"","Lock Deposit Amount":d.lock_deposit_amount||"","Tenant Deposit":d.tenant_deposit||"","Key Number":d.key_number||"","Row/Location":d.row_name||"","Box Number":d.box_no||"","Size":d.size||"","Review Date":d.review||"","Move-in Date":d.move_in_date||"","Notes":d.notes||""}));
      const ws=XLSX.utils.json_to_sheet(rows);
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,"Cerect");

      // Add Enquiries sheet
      const crmR=await fetch(`${SUPABASE_URL}/rest/v1/enquiries?org_id=eq.${orgId}&order=enquiry_date.desc`,{headers:authH(token)});
      const crmData=await crmR.json();
      if(Array.isArray(crmData)&&crmData.length>0){
        const crmRows=crmData.map(e=>({"Name":e.name||"","Email":e.email||"","Phone":e.phone||"","Category":e.category||"","Size Needed":e.size_needed||"","Status":e.status||"","Enquiry Date":e.enquiry_date||"","Notes":e.notes||""}));
        const crmWs=XLSX.utils.json_to_sheet(crmRows);
        XLSX.utils.book_append_sheet(wb,crmWs,"CRM Enquiries");
      }

      const excelBlob=XLSX.write(wb,{bookType:"xlsx",type:"array"});
      zip.file("Cerect_Data.xlsx", excelBlob);

      // Step 2 — get all document folders
      const listR=await fetch(`${SUPABASE_URL}/storage/v1/object/list/documents`,{
        method:"POST",
        headers:{...BASE_H,Authorization:`Bearer ${token}`},
        body:JSON.stringify({prefix:"",limit:500,delimiter:"/"})
      });
      const folders=await listR.json();

      // Step 3 — fetch each document and add to zip
      let totalFiles=0;
      if(Array.isArray(folders)){
        for(const folder of folders){
          const folderName=(folder.name||"").replace(/\/$/,"");
          if(!folderName||folderName==="archive") continue;
          const tenant=data.find(t=>{
            const safe=(t.id||"").replace(/\s+/g,'').replace(/[^a-zA-Z0-9._-]/g,'_');
            return safe===folderName||t.id===folderName;
          });
          const folderLabel=tenant?(tenant.tenant||tenant.label||folderName):folderName;
          const fr=await fetch(`${SUPABASE_URL}/storage/v1/object/list/documents`,{
            method:"POST",
            headers:{...BASE_H,Authorization:`Bearer ${token}`},
            body:JSON.stringify({prefix:folderName+"/",limit:100})
          });
          const files=await fr.json();
          if(!Array.isArray(files)) continue;
          for(const file of files){
            if(!file.id) continue;
            const filePath=`${folderName}/${file.name}`;
            const signR=await fetch(`${SUPABASE_URL}/storage/v1/object/sign/documents/${filePath}`,{
              method:"POST",
              headers:{...BASE_H,Authorization:`Bearer ${token}`},
              body:JSON.stringify({expiresIn:300})
            });
            const signD=await signR.json();
            if(!signD.signedURL) continue;
            const fileR=await fetch(`${SUPABASE_URL}/storage/v1${signD.signedURL}`);
            if(!fileR.ok) continue;
            const blob=await fileR.blob();
            const displayName=file.name.replace(/^\d+_/,"");
            zip.folder(`Documents/${folderLabel}`).file(displayName,blob);
            totalFiles++;
            showToast(`⏳ Adding file ${totalFiles}…`);
          }
        }
      }

      // Step 4 — generate and download the zip
      showToast("⏳ Creating zip file…");
      const zipBlob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
      const date=new Date().toISOString().slice(0,10);
      const a=document.createElement("a");
      a.href=URL.createObjectURL(zipBlob);
      a.download=`Cerect_Backup_${date}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      showToast(`✅ Backup complete — ${totalFiles} document${totalFiles!==1?"s":""} + data`);
    }catch(e){
      showToast("❌ Backup failed — "+e.message);
    }
  }

  // ── Import from original spreadsheet format ────────────────────────────────
  function parseOriginalFormat(ws){
    const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
    const records=[];
    let currentCategory="Storage";
    let currentRow=null;

    const statusMap={
      "Occupied":"occupied","occupied":"occupied",
      "In arrears":"arrears","In Arrears":"arrears","in arrears":"arrears",
      "Leaving":"leaving","leaving":"leaving",
      "New Customer":"new","new customer":"new","New customer":"new",
      "Pending":"pending","pending":"pending",
      "Available":"available","available":"available",
    };

    const legendVals=new Set(["in arrears","leaving","new customer","pending","available"]);

    function isSectionHeader(colA, colB, row){
      if(!colA) return false;
      if(colA.startsWith("=")) return false;
      if(colA.toLowerCase()==="status") return false;
      const hasColD=row[3]!=null&&String(row[3]).trim()!=="";
      if(hasColD) return false;
      const hasTenant=row[5]!=null&&String(row[5]).trim()!=="";
      if(hasTenant) return false;
      if(colB&&colB.toLowerCase()!=="") return false;
      return true;
    }

    for(let i=0;i<raw.length;i++){
      const row=raw[i];
      if(!row||row.every(v=>v===null||v===undefined||v==="")) continue;

      const colA=row[0]!=null?String(row[0]).trim():"";
      const colB=row[1]!=null?String(row[1]).trim():"";

      if(!colA&&!colB) continue;
      if(colA.startsWith("=")||colB==="Status") continue;
      if(colA.match(/^\d{2}\/\d{2}\/\d{4}/)) continue;
      if(!colA&&colB&&legendVals.has(colB.toLowerCase())) continue;

      if(isSectionHeader(colA, colB, row)){
        const lower=colA.toLowerCase().trim();
        if(lower.startsWith("residential")){currentCategory="Residential";currentRow=null;}
        else if(lower.startsWith("commercial")){currentCategory="Commercial";currentRow=null;}
        else{
          // All other sections are Storage areas — use the name as-is
          currentCategory="Storage";
          currentRow=colA.trim();
        }
        continue;
      }

      if(!colB||!statusMap[colB]) continue;
      if(!colA) continue;

      const id=String(colA).replace(/\s+/g,"");
      const status=statusMap[colB]||"occupied";
      const boxNo=row[2]?String(row[2]).trim():null;
      const size=row[3]?String(row[3]).trim():null;
      const startDate=row[4]?String(row[4]).trim():null;
      const tenant=row[5]?String(row[5]).trim()||null:null;
      const payment=row[6]?String(row[6]).trim():null;
      const address=(currentCategory==="Residential"||currentCategory==="Commercial")?boxNo:null;
      let rent=null;
      if(row[12]!=null){const v=Number(row[12]);if(!isNaN(v)&&v>0)rent=v;}
      let vatRent=null;
      if(row[13]!=null){const v=Number(row[13]);if(!isNaN(v)&&v>0)vatRent=v;}
      const email=row[19]?String(row[19]).trim():null;
      const phone=row[20]?String(row[20]).trim():null;
      const review=row[21]?String(row[21]).trim():null;
      const lockDepositPaid=row[7]?String(row[7]).trim():null;
      let lockDepositAmount=null;
      if(row[8]!=null&&!isNaN(Number(row[8])))lockDepositAmount=Number(row[8]);
      let tenantDeposit=null;
      if(row[10]!=null&&!isNaN(Number(row[10])))tenantDeposit=Number(row[10]);
      const keyNumber=row[9]?String(row[9]).trim():null;
      const label=(currentCategory==="Residential"||currentCategory==="Commercial")?(colA):null;

      // Skip duplicate IDs
      if(records.some(r=>r.id===id)) continue;

      records.push({
        id,label:label||null,tenant:tenant||null,email:email||null,
        phone:phone||null,payment:payment||null,address:address||null,
        rent,vat_rent:vatRent,status,category:currentCategory,
        row_name:currentRow,box_no:boxNo,size,section:null,
        review:review||startDate||null,notes:null,
        lock_deposit_paid:lockDepositPaid,lock_deposit_amount:lockDepositAmount,
        tenant_deposit:tenantDeposit,key_number:keyNumber,
      });
    }
    return records;
  }

  function parsePlatformFormat(ws){
    return XLSX.utils.sheet_to_json(ws).map(r=>({
      id:String(r["Unit ID"]||"").trim(),label:r["Property/Label"]||null,
      category:r["Category"]||"Storage",tenant:r["Tenant"]||null,
      address:r["Address"]||null,email:r["Email"]||null,phone:r["Phone"]||null,
      payment:r["Payment Method"]||null,
      rent:r["Rent Ex-VAT"]?Number(r["Rent Ex-VAT"]):null,
      vat_rent:r["Rent Inc-VAT"]?Number(r["Rent Inc-VAT"]):null,
      status:Object.entries(SL).find(([k,v])=>v===r["Status"])?.[0]||r["Status"]||"occupied",
      lock_deposit_paid:r["Lock Deposit Paid"]||null,
      lock_deposit_amount:r["Lock Deposit Amount"]?Number(r["Lock Deposit Amount"]):null,
      tenant_deposit:r["Tenant Deposit"]?Number(r["Tenant Deposit"]):null,
      key_number:r["Key Number"]||null,
      row_name:r["Row/Location"]||null,box_no:r["Box Number"]||null,size:r["Size"]||null,
      review:r["Review Date"]||null,move_in_date:r["Move-in Date"]||null,notes:r["Notes"]||null,
    })).filter(r=>r.id);
  }

  function handleFile(e){
    const file=e.target.files[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const wb=XLSX.read(ev.target.result,{type:"binary"});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const firstRow=XLSX.utils.sheet_to_json(ws,{header:1})[0]||[];
      const isPlatformFormat=firstRow.includes("Unit ID");
      const isOriginalFormat=wb.SheetNames.includes("Tenant Schedule");
      const isUnrecognised=!isPlatformFormat&&!isOriginalFormat;

      if(isUnrecognised){
        const proceed=window.confirm(`⚠️ This spreadsheet doesn't match the expected format.\n\nExpected either:\n• Your original Storage Schedule (with a "Tenant Schedule" sheet)\n• A platform backup (with a "Unit ID" column)\n\nThe importer will try to read it as an original Storage Schedule format.\n\nProceed anyway?`);
        if(!proceed){e.target.value="";return;}
      }

      let records=isPlatformFormat?parsePlatformFormat(ws):parseOriginalFormat(ws);
      records=records.filter(r=>r.id);

      if(records.length===0){
        showToast("❌ No valid records found — check the spreadsheet format");
        e.target.value="";
        return;
      }
      // Check for duplicates
      const existingIds=new Set(data.map(d=>d.id));
      const duplicates=records.filter(r=>existingIds.has(r.id)).map(r=>r.id);
      let confirmMsg=`Import ${records.length} record${records.length!==1?"s":""} from "${file.name}"?\n\nThis will merge with your existing data.`;
      if(duplicates.length>0) confirmMsg+=`\n\n⚠️ ${duplicates.length} existing unit${duplicates.length!==1?"s":""} will be overwritten: ${duplicates.slice(0,5).join(", ")}${duplicates.length>5?" and more...":""}`;
      if(!window.confirm(confirmMsg)) return;
      onImport(records);
    };
    reader.readAsBinaryString(file);
    e.target.value="";
  }

  return(
    <div>
      <div className="g2" style={{marginBottom:0}}>
        <div className="card">
          <div className="ch"><div className="ct">📥 Export — Original Format</div></div>
          <div className="cb">
            <p className="tsub tsm" style={{marginBottom:14}}>Downloads in the same layout as your original Storage Schedule spreadsheet — same columns, same section headers, same sheet name.</p>
            <button className="btn btn-success" onClick={exportOriginal}>⬇️ Download as Storage Schedule</button>
          </div>
        </div>
        <div className="card" style={{border:"2px solid var(--gold)"}}>
          <div className="ch"><div className="ct">🚨 Emergency Backup</div></div>
          <div className="cb">
            <p className="tsub tsm" style={{marginBottom:14}}>Downloads everything — all tenant data as a spreadsheet plus every document stored on the platform. Save this to an external hard drive or cloud storage weekly.</p>
            <button className="btn btn-navy" onClick={fullBackup}>⬇️ Download Full Backup (Data + All Documents)</button>
          </div>
        </div>
      </div>
      <div className="card" style={{marginTop:20}}>
        <div className="ch"><div className="ct">📤 Import from Excel</div></div>
        <div className="cb">
          <p className="tsub tsm" style={{marginBottom:14}}>
            Upload either your <strong>original Storage Schedule spreadsheet</strong> or a <strong>platform backup</strong> — the format is detected automatically.
          </p>
          <input id="xlsxImport" type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={handleFile}/>
          <button className="btn btn-navy" onClick={()=>document.getElementById("xlsxImport").click()}>⬆️ Choose Excel File to Import</button>
        </div>
      </div>
    </div>
  );
}


// ─── Users & Security ─────────────────────────────────────────────────────────
function UsersPage({token,currentUserEmail,orgId,onAudit}){
  const [users,setUsers]=useState([]);
  const [inviteEmail,setInviteEmail]=useState("");
  const [newEmail,setNewEmail]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [inviting,setInviting]=useState(false);
  const [adding,setAdding]=useState(false);
  const [msg,setMsg]=useState("");
  const [showAdd,setShowAdd]=useState(false);
  const [myFactors,setMyFactors]=useState([]);
  const [mfaLoading,setMfaLoading]=useState(false);
  const [showChangePw,setShowChangePw]=useState(false);
  const [newPw,setNewPw]=useState("");
  const [confirmPw,setConfirmPw]=useState("");
  const [changingPw,setChangingPw]=useState(false);
  const [loginLog,setLoginLog]=useState([]);
  const [logLoading,setLogLoading]=useState(true);

  useEffect(()=>{
    listUsers().then(u=>{setUsers(u);}).catch(()=>{setUsers([]);});
    mfaListFactors(token).then(f=>setMyFactors(Array.isArray(f)?f:[])).catch(()=>{});
    loginLogList(token).then(l=>{setLoginLog(Array.isArray(l)?l:[]);setLogLoading(false);}).catch(()=>setLogLoading(false));
  },[token]);

  async function handleInvite(){
    if(!inviteEmail) return;
    setInviting(true); setMsg("");
    const tempPass = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase() + "!1";
    try{
      // Create the user in Supabase
      const d=await adminCall("createUser",{email:inviteEmail,password:tempPass});
      if(d.error) throw new Error("User creation failed: "+(d.error_description||d.msg));
      // Send invite email via serverless function
      const emailResult=await sendInviteEmail(inviteEmail, tempPass);
      if(emailResult.id){
        if(onAudit) onAudit("invite_user","user",inviteEmail,inviteEmail,{method:"email"});
        setMsg(`✅ Invitation sent to ${inviteEmail} — they will receive an email with login details`);
      } else {
        setMsg(`✅ User created but email may not have sent — temporary password: ${tempPass}`);
      }
      setInviteEmail("");
      const fresh=await listUsers(); setUsers(fresh);
    }catch(e){
      setMsg(`❌ Could not send invite — ${e.message}`);
    }
    setInviting(false);
  }

  async function handleAddUser(){
    if(!newEmail||!newPassword) return;
    setAdding(true); setMsg("");
    try{
      const d=await adminCall("createUser",{email:newEmail,password:newPassword});
      if(d.error) throw new Error(d.error_description||d.msg||"Failed");
      setMsg(`✅ User ${newEmail} created successfully`);
      setNewEmail(""); setNewPassword(""); setShowAdd(false);
      const fresh=await listUsers(); setUsers(fresh);
    }catch(e){ setMsg(`❌ Could not create user — ${e.message}`); }
    setAdding(false);
  }

  async function handleRemoveUser(userId,email){
    if(!window.confirm(`Remove ${email} from Cerect? They will no longer be able to log in.`)) return;
    try{
      await deleteUser(userId);
      if(onAudit) onAudit("remove_user","user",userId,email,{});
      setMsg(`✅ ${email} has been removed`);
      const fresh=await listUsers(); setUsers(fresh);
    }catch(e){ setMsg("❌ Could not remove user"); }
  }

  async function handleRemoveMFA(factorId){
    if(!window.confirm("Remove your MFA authenticator? You will no longer be asked for a code when logging in.")) return;
    setMfaLoading(true);
    try{
      await mfaUnenroll(factorId,token);
      setMyFactors([]);
      setMsg("✅ MFA removed from your account");
    }catch(e){ setMsg("❌ Could not remove MFA"); }
    setMfaLoading(false);
  }

  async function handleChangePassword(){
    if(!newPw||!confirmPw){setMsg("❌ Please fill in all password fields");return;}
    if(newPw!==confirmPw){setMsg("❌ New passwords do not match");return;}
    if(newPw.length<8){setMsg("❌ Password must be at least 8 characters");return;}
    setChangingPw(true); setMsg("");
    try{
      const ok=await changePassword(newPw,token);
      if(ok){
        setMsg("✅ Password changed successfully");
        setNewPw(""); setConfirmPw(""); setShowChangePw(false);
      } else {
        setMsg("❌ Could not change password — please try again");
      }
    }catch(e){setMsg("❌ Error: "+e.message);}
    setChangingPw(false);
  }

  const verifiedFactors=myFactors.filter(f=>f.status==="verified");

  return(
    <div>
      {/* Change Password */}
      <div className="card">
        <div className="ch">
          <div className="ct">🔑 Change My Password</div>
          <button className="btn btn-outline btn-sm" onClick={()=>{setShowChangePw(!showChangePw);setMsg("");}}>{showChangePw?"✕ Cancel":"Change Password"}</button>
        </div>
        {showChangePw&&(
          <div className="cb">
            <div className="fg">
              <div className="fgi"><label>New Password</label><input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="At least 8 characters"/></div>
              <div className="fgi"><label>Confirm New Password</label><input type="password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Repeat new password"/></div>
            </div>
            <button className="btn btn-primary" style={{marginTop:12}} onClick={handleChangePassword} disabled={changingPw||!newPw||!confirmPw}>{changingPw?"Changing...":"Update Password"}</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="ch"><div className="ct">🔐 My Two-Factor Authentication</div></div>
        <div className="cb">
          {verifiedFactors.length>0?(
            <div>
              <div style={{background:"#EBF5F0",border:"1.5px solid #BDE5D3",borderRadius:9,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <strong style={{color:"var(--success)"}}>✅ MFA is active on your account</strong>
                  <div className="tsub tsm" style={{marginTop:3}}>You are protected with an authenticator app. Each login requires a 6-digit code.</div>
                </div>
              </div>
              {verifiedFactors.map(f=>(
                <div key={f.id} className="flex-bet">
                  <div>
                    <div style={{fontWeight:600,fontSize:13}}>{f.friendly_name||"Authenticator App"}</div>
                    <div className="tsub tsm">Added: {f.created_at?new Date(f.created_at).toLocaleDateString("en-GB"):"Unknown"}</div>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={()=>handleRemoveMFA(f.id)} disabled={mfaLoading}>Remove MFA</button>
                </div>
              ))}
            </div>
          ):(
            <div style={{background:"#FFF8E6",border:"1.5px solid #F5E0A0",borderRadius:9,padding:"12px 16px"}}>
              ⚠️ <strong>MFA is not enabled on your account.</strong>
              <div className="tsub tsm" style={{marginTop:3}}>Sign out and sign back in — you will be prompted to set up your authenticator app during login.</div>
            </div>
          )}
        </div>
      </div>

      {msg&&<div style={{padding:"10px 14px",background:msg.startsWith("✅")?"#EBF5F0":"#FFF0EE",border:`1.5px solid ${msg.startsWith("✅")?"#BDE5D3":"#FFCDD2"}`,borderRadius:9,marginBottom:14,fontSize:13}}>{msg}</div>}

      <div className="card">
        <div className="ch">
          <div className="ct">Active Users</div>
          <div className="fr">
            <span className="chip">{users.length} users</span>
            <button className="btn btn-primary btn-sm" onClick={()=>setShowAdd(!showAdd)}>{showAdd?"✕ Cancel":"+ Add User"}</button>
          </div>
        </div>
        <div className="cb">
          {showAdd&&(
            <div style={{background:"#F8FAFC",border:"1.5px dashed #C9D8E8",borderRadius:9,padding:"16px",marginBottom:16}}>
              <div style={{fontFamily:"var(--fh)",fontWeight:700,fontSize:13,marginBottom:12,color:"var(--navy)"}}>Create New User</div>
              <div className="fg">
                <div className="fgi"><label>Email Address</label><input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)} placeholder="colleague@example.com"/></div>
                <div className="fgi"><label>Temporary Password</label><input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="They can change this after login"/></div>
              </div>
              <button className="btn btn-primary" style={{marginTop:12}} onClick={handleAddUser} disabled={adding||!newEmail||!newPassword}>{adding?"Creating...":"Create User"}</button>
              <div className="tsub tsm" style={{marginTop:8}}>The user can log in immediately and will be prompted to set up MFA on first login.</div>
            </div>
          )}
          {users.length===0&&<p className="tsub tsm">Loading users...</p>}
          {users.map(u=>(
            <div key={u.id} className="user-card">
              <div className="user-info-block">
                <div className="uemail">{u.email} {u.email===currentUserEmail&&<span className="chip" style={{marginLeft:6}}>You</span>}</div>
                <div className="umeta">
                  Last sign in: {u.last_sign_in_at?new Date(u.last_sign_in_at).toLocaleDateString("en-GB"):"Never"} ·
                  Created: {new Date(u.created_at).toLocaleDateString("en-GB")}
                  {u.factors?.length>0&&<span style={{color:"var(--success)",fontWeight:600}}> · 🔐 MFA on</span>}
                  {(!u.factors||u.factors.length===0)&&<span style={{color:"#E65100"}}> · No MFA</span>}
                </div>
              </div>
              <div className="fr">
                {u.email!==currentUserEmail&&(
                  <button className="btn btn-danger btn-sm" onClick={()=>handleRemoveUser(u.id,u.email)}>Remove</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="invite-box">
        <div className="invite-title">✉️ Invite User by Email</div>
        <p className="tsub tsm" style={{marginBottom:12}}>Send an invitation email — the recipient clicks a link to set their own password and will be prompted to set up MFA on first login.</p>
        <div className="invite-row">
          <div style={{flex:1}}>
            <input className="sin" style={{width:"100%"}} type="email" placeholder="colleague@example.com" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/>
          </div>
          <button className="btn btn-primary" onClick={handleInvite} disabled={inviting}>{inviting?"Sending...":"Send Invite"}</button>
        </div>
      </div>

      {/* Login Log */}
      <div className="card" style={{marginTop:24}}>
        <div className="ch">
          <div className="ct">Login History</div>
          {logLoading&&<span style={{fontSize:12,color:"var(--sub)"}}>Loading…</span>}
        </div>
        {!logLoading&&loginLog.length===0&&(
          <div style={{padding:"20px",textAlign:"center",color:"var(--sub)",fontSize:13}}>
            No login records yet — logins will be recorded here from now on.
          </div>
        )}
        {!logLoading&&loginLog.length>0&&(
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Day</th>
                </tr>
              </thead>
              <tbody>
                {loginLog.map((l,i)=>{
                  const d=new Date(l.logged_in_at);
                  return(
                    <tr key={i}>
                      <td style={{fontWeight:500}}>{l.email}</td>
                      <td>{d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</td>
                      <td>{d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</td>
                      <td style={{color:"var(--sub)",fontSize:12}}>{d.toLocaleDateString("en-GB",{weekday:"long"})}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Tenant Documents ─────────────────────────────────────────────────────────
function TenantDocuments({tenantId, token, orgId, showToast, onAudit}){
  // Preserve folder prefixes like archive/ and enquiry/ — only sanitise each segment
  const safeId=(tenantId||"").split("/").map(seg=>seg.replace(/\s+/g,'').replace(/[^a-zA-Z0-9._-]/g,"_")).join("/");
  const [docs,setDocs]=useState([]);
  const [tags,setTags]=useState({});
  const [uploading,setUploading]=useState(false);
  const [dragOver,setDragOver]=useState(false);
  const [pendingTag,setPendingTag]=useState(null); // {file, tag}
  const [tagFilter,setTagFilter]=useState("all");
  const [viewerDoc,setViewerDoc]=useState(null);
  const inputRef=useRef(null);

  async function downloadAll(){
    if(!docs||docs.length===0) return;
    if(docs.length>1&&!window.confirm(`Download all ${docs.length} documents?\n\nYour browser may ask permission to download multiple files — click Allow when prompted.`)) return;
    for(const doc of docs){
      const path=`${safeId}/${doc.name}`;
      try{
        const url=await getSignedUrl(path,token);
        if(!url) continue;
        const r=await fetch(url);
        const blob=await r.blob();
        const tagInfo=tags[path];
        const displayName=(tagInfo?.original_name||doc.name).replace(/^\d+_/,"");
        const a=document.createElement("a");
        a.href=URL.createObjectURL(blob);
        a.download=displayName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        await new Promise(res=>setTimeout(res,300));
      }catch(e){}
    }
  }

  async function reload(){
    const [d,t]=await Promise.all([listDocuments(safeId,token),getDocTags(safeId, token)]);
    setDocs(Array.isArray(d)?d:[]);
    const tagMap={};
    (Array.isArray(t)?t:[]).forEach(r=>{tagMap[r.file_path]=r;});
    setTags(tagMap);
  }

  useEffect(()=>{
    if(!tenantId) return;
    Promise.all([listDocuments(safeId,token),getDocTags(safeId, token)]).then(([d,t])=>{
      setDocs(Array.isArray(d)?d:[]);
      const tagMap={};
      (Array.isArray(t)?t:[]).forEach(r=>{tagMap[r.file_path]=r;});
      setTags(tagMap);
    });
  },[tenantId,token,safeId]);

  async function handleUpload(files){
    if(!files||!files.length) return;
    setUploading(true);
    const fileArr=Array.from(files);
    let failed=0; let uploaded=0;
    for(const file of fileArr){
      try{
        const path=await uploadDocument(file,safeId,token);
        await saveDocTag(path,safeId,"Other",file.name,token,orgId);
        uploaded++;
      }catch(e){failed++;}
    }
    await reload();
    setUploading(false);
    if(uploaded>0 && showToast && onAudit) onAudit("upload","document",tenantId,`${uploaded} file${uploaded!==1?"s":""}`,{tenant_id:tenantId,count:uploaded});
    if(failed>0) showToast(`⚠️ ${failed} file${failed!==1?"s":""} failed to upload — check your connection`);
  }

  async function confirmUpload(){
    if(!pendingTag) return;
    setUploading(true);
    try{
      const path=await uploadDocument(pendingTag.file,safeId,token);
      await saveDocTag(path,safeId,pendingTag.tag,pendingTag.file.name,token,orgId);
      if(onAudit) onAudit("upload","document",tenantId,pendingTag.file.name,{tenant_id:tenantId,tag:pendingTag.tag});
      setPendingTag(null);
      await reload();
    }catch(e){
      showToast("Upload failed — "+e.message);
      setPendingTag(null);
    }
    setUploading(false);
  }

  async function handleDelete(doc){
    const path=`${safeId}/${doc.name}`;
    if(!window.confirm(`Delete "${doc.name.replace(/^\d+_/,'')}"?`)) return;
    await deleteDocument(path,token);
    await deleteDocTag(path,token);
    if(onAudit) onAudit("delete","document",tenantId,doc.name.replace(/^\d+_/,''),{tenant_id:tenantId});
    await reload();
  }

  async function handleTagChange(filePath, newTag){
    await updateDocTag(filePath,newTag,token);
      // Reload tags from DB to ensure UI reflects actual saved state
    const fresh=await getDocTags(safeId, token, orgId);
    const tagMap={};
    (Array.isArray(fresh)?fresh:[]).forEach(r=>{tagMap[r.file_path]=r;});
    setTags(tagMap);
  }

  const allDocs=docs.filter(d=>tagFilter==="all"||tags[`${safeId}/${d.name}`]?.tag===tagFilter);

  return(
    <div>
      {/* Tag filter and download all */}
      <div className="fr" style={{flexWrap:"wrap",gap:4,marginBottom:10,justifyContent:"space-between"}}>
        <div className="fr" style={{flexWrap:"wrap",gap:4}}>
          {["all",...DOC_TAGS].map(t=>(
            <button key={t} className={`btn btn-sm ${tagFilter===t?"btn-primary":"btn-outline"}`}
              style={{fontSize:11,padding:"3px 8px"}} onClick={()=>setTagFilter(t)}>
              {t==="all"?"All":t}
            </button>
          ))}
        </div>
        {docs.length>0&&<button className="btn btn-outline btn-sm" onClick={downloadAll} title="Download all documents for this tenant">⬇️ Download All</button>}
      </div>

      {/* Upload zone */}
      <div className={`upload-zone${dragOver?" drag-over":""}`}
        onClick={()=>inputRef.current?.click()}
        onDragOver={e=>{e.preventDefault();setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleUpload(e.dataTransfer.files);}}
      >
        <input ref={inputRef} type="file" multiple onChange={e=>handleUpload(e.target.files)}/>
        <div style={{fontSize:24,marginBottom:6}}>📎</div>
        <div style={{fontSize:13,fontWeight:600,color:"var(--navy)"}}>Drop files here or click to upload</div>
        <div style={{fontSize:11,color:"var(--sub)",marginTop:4}}>You can drop multiple files at once — any file type supported</div>
        {uploading&&<div style={{marginTop:6,fontSize:12,color:"var(--gold)"}}>⏳ Uploading…</div>}
      </div>

      {/* Tag selection modal for pending upload */}
      {pendingTag&&(
        <div style={{background:"#F8FAFC",border:"1.5px solid var(--gold)",borderRadius:9,padding:14,marginTop:10}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--navy)",marginBottom:8}}>
            📎 {pendingTag.file.name} — select a tag:
          </div>
          <div className="fr" style={{flexWrap:"wrap",gap:6,marginBottom:10}}>
            {DOC_TAGS.map(t=>(
              <button key={t} className={`btn btn-sm ${pendingTag.tag===t?"btn-primary":"btn-outline"}`}
                style={{fontSize:12}} onClick={()=>setPendingTag(p=>({...p,tag:t}))}>
                {t}
              </button>
            ))}
          </div>
          <div className="fr" style={{gap:8}}>
            <button className="btn btn-primary btn-sm" onClick={confirmUpload}>⬆️ Upload as "{pendingTag.tag}"</button>
            <button className="btn btn-outline btn-sm" onClick={()=>setPendingTag(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Document list */}
      {allDocs.length>0&&(
        <div style={{marginTop:10,border:"1px solid #E4EAF2",borderRadius:9,overflow:"hidden"}}>
          {allDocs.map(doc=>{
            const path=`${safeId}/${doc.name}`;
            const tagInfo=tags[path];
            const displayName=(tagInfo?.original_name||doc.name).replace(/^\d+_/,"");
            return(
              <div key={doc.name} className="doc-item">
                <div className="doc-icon">{fileIcon(displayName)}</div>
                <div className="doc-info">
                  <div className="doc-name">{displayName}</div>
                  <div className="doc-meta" style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <select
                      key={tagInfo?.tag||"none"}
                      style={{fontSize:11,padding:"2px 6px",borderRadius:4,border:"1px solid #C9D8E8",color:"var(--navy)",background:"#F8FAFC",cursor:"pointer"}}
                      defaultValue={tagInfo?.tag||""}
                      onChange={e=>e.target.value&&handleTagChange(path,e.target.value)}>
                      <option value="">{tagInfo?.tag||"— Add tag —"}</option>
                      {DOC_TAGS.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                    <span style={{color:"var(--sub)"}}>{formatBytes(doc.metadata?.size)}</span>
                    {doc.created_at&&<span style={{color:"var(--sub)"}}>{new Date(doc.created_at).toLocaleDateString("en-GB")}</span>}
                  </div>
                </div>
                <div className="doc-actions">
                  <button className="btn btn-outline btn-sm" onClick={async()=>{const url=await getSignedUrl(path,token);if(url)setViewerDoc({url,name:displayName});}}>👁 View</button>
                  <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(doc)}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {allDocs.length===0&&!uploading&&!pendingTag&&(
        <p style={{fontSize:12,color:"var(--sub)",textAlign:"center",marginTop:10}}>
          {tagFilter==="all"?"No documents yet":"No documents with this tag"}
        </p>
      )}
      {viewerDoc&&<DocViewer url={viewerDoc.url} name={viewerDoc.name} onClose={()=>setViewerDoc(null)}/>}
    </div>
  );
}


function DocumentsPage({data,token,showToast,orgId,onAudit}){
  const [folders,setFolders]=useState([]); // just folder names
  const [folderDocs,setFolderDocs]=useState({}); // loaded docs per folder
  const [allTags,setAllTags]=useState({});
  const [loading,setLoading]=useState(true);
  const [loadingFolder,setLoadingFolder]=useState({});
  const [viewerDoc,setViewerDoc]=useState(null);
  const [q,setQ]=useState("");
  const [tagFilter,setTagFilter]=useState("all");
  const [expanded,setExpanded]=useState({});
  const [enquiries,setEnquiries]=useState([]);

  useEffect(()=>{
    // Only load folder list and tags on mount — not all files
    Promise.all([
      fetch(`${SUPABASE_URL}/storage/v1/object/list/documents`,{
        method:"POST",
        headers:{...BASE_H,Authorization:`Bearer ${token}`},
        body:JSON.stringify({prefix:"",limit:500,delimiter:"/"})
      }).then(r=>r.ok?r.json():[]),
      getAllDocTags(token),
      enquiryList(token)
    ]).then(([flds,tags,enqs])=>{
      // Filter out archive folders
      const validFolders=(Array.isArray(flds)?flds:[])
        .map(f=>(f.name||"").replace(/\/$/,""))
        .filter(f=>f&&f!=="archive"&&f!=="enquiry_archive");
      setFolders(validFolders);
      const tagMap={};
      (Array.isArray(tags)?tags:[]).forEach(r=>{tagMap[r.file_path]=r;});
      setAllTags(tagMap);
      setEnquiries(Array.isArray(enqs)?enqs:[]);
      setLoading(false);
    });
  },[token]);

  async function loadFolder(folderName){
    if(folderDocs[folderName]) return; // already loaded
    setLoadingFolder(l=>({...l,[folderName]:true}));
    try{
      const fr=await fetch(`${SUPABASE_URL}/storage/v1/object/list/documents`,{
        method:"POST",
        headers:{...BASE_H,Authorization:`Bearer ${token}`},
        body:JSON.stringify({prefix:folderName+"/",limit:200,sortBy:{column:"created_at",order:"desc"}})
      });
      const files=await fr.json();
      const realFiles=(Array.isArray(files)?files:[]).filter(f=>f.id).map(f=>({
        ...f,
        name:folderName+"/"+f.name,
        filename:f.name,
        path:folderName+"/"+f.name
      }));
      setFolderDocs(d=>({...d,[folderName]:realFiles}));
    }catch(e){
      setFolderDocs(d=>({...d,[folderName]:[]}));
    }
    setLoadingFolder(l=>({...l,[folderName]:false}));
  }

  async function toggleExpand(folderName){
    const nowOpen=!expanded[folderName];
    setExpanded(e=>({...e,[folderName]:nowOpen}));
    if(nowOpen) await loadFolder(folderName);
  }

  async function handleDelete(path, folderName){
    if(!window.confirm("Delete this document?")) return;
    await deleteDocument(path,token);
    await deleteDocTag(path,token);
    // Remove from local state
    setFolderDocs(d=>({...d,[folderName]:(d[folderName]||[]).filter(f=>f.path!==path)}));
  }

  async function handleTagChange(filePath, newTag){
    await updateDocTag(filePath,newTag,token);
    const fresh=await getAllDocTags(token, orgId);
    const tagMap={};
    (Array.isArray(fresh)?fresh:[]).forEach(r=>{tagMap[r.file_path]=r;});
    setAllTags(tagMap);
    if(showToast) showToast("✅ Tag saved");
  }

  function getFolderName(folderName){
    const isEnquiry=folderName.startsWith("enquiry_");
    const enquiryId=isEnquiry?folderName.replace("enquiry_",""):null;
    const enquiry=enquiryId?enquiries.find(e=>String(e.id)===enquiryId):null;
    if(enquiry) return `📋 ${enquiry.name} (Enquiries)`;
    const safeId=folderName.replace(/\s+/g,'').replace(/[^a-zA-Z0-9._-]/g,'_');
    const tenant=data.find(t=>{
      const ts=(t.id||"").replace(/\s+/g,'').replace(/[^a-zA-Z0-9._-]/g,'_');
      return ts===safeId||t.id===folderName;
    });
    return tenant?(tenant.tenant||tenant.label||("Unit "+folderName)):("Unit "+folderName);
  }

  const filteredFolders=folders.filter(f=>{
    const name=getFolderName(f);
    return !q||name.toLowerCase().includes(q.toLowerCase())||f.toLowerCase().includes(q.toLowerCase());
  });

  return(
    <div>
      <div className="fb mb20" style={{flexWrap:"wrap",gap:10}}>
        <div className="fr" style={{flexWrap:"wrap",gap:6}}>
          <input className="sin sinw" placeholder="Search by tenant or name…" value={q} onChange={e=>setQ(e.target.value)}/>
          {["all",...DOC_TAGS].map(t=>(
            <button key={t} className={`btn btn-sm ${tagFilter===t?"btn-primary":"btn-outline"}`}
              style={{fontSize:11}} onClick={()=>setTagFilter(t)}>
              {t==="all"?"All Tags":t}
            </button>
          ))}
        </div>
      </div>

      {loading&&<div className="loading">⏳ Loading…</div>}

      {!loading&&filteredFolders.length===0&&(
        <div className="card"><div className="cb" style={{textAlign:"center",padding:40}}>
          <div style={{fontSize:40,marginBottom:12}}>📁</div>
          <div style={{fontSize:14,fontWeight:600,color:"var(--navy)"}}>No documents found</div>
        </div></div>
      )}

      {filteredFolders.map(folderName=>{
        const name=getFolderName(folderName);
        const isOpen=expanded[folderName];
        const docs=(folderDocs[folderName]||[]).filter(doc=>{
          const tagInfo=allTags[doc.path];
          return tagFilter==="all"||tagInfo?.tag===tagFilter;
        });
        const isLoading=loadingFolder[folderName];
        const totalCount=folderDocs[folderName]?.length;

        return(
          <div key={folderName} className="card" style={{marginBottom:8}}>
            <div className="ch" style={{cursor:"pointer"}} onClick={()=>toggleExpand(folderName)}>
              <div className="fr" style={{gap:10,alignItems:"center"}}>
                <span style={{fontSize:16,color:"var(--navy)"}}>{isOpen?"▾":"▸"}</span>
                <div className="ct" style={{fontSize:14}}>{name}</div>
                {totalCount!=null&&<span className="chip">{totalCount} file{totalCount!==1?"s":""}</span>}
              </div>
            </div>
            {isOpen&&(
              <div className="cb" style={{padding:0}}>
                {isLoading&&<div style={{padding:16,color:"var(--sub)",fontSize:13}}>⏳ Loading documents…</div>}
                {!isLoading&&docs.length===0&&<div style={{padding:16,color:"var(--sub)",fontSize:13}}>No documents{tagFilter!=="all"?" with this tag":""}</div>}
                {!isLoading&&docs.map(doc=>{
                  const tagInfo=allTags[doc.path];
                  const displayName=(tagInfo?.original_name||doc.filename).replace(/^\d+_/,"");
                  return(
                    <div key={doc.path} className="doc-item">
                      <div className="doc-icon">{fileIcon(displayName)}</div>
                      <div className="doc-info">
                        <div className="doc-name">{displayName}</div>
                        <div className="doc-meta" style={{display:"flex",alignItems:"center",gap:8}}>
                          <select
                            key={tagInfo?.tag||"none"}
                            style={{fontSize:11,padding:"2px 6px",borderRadius:4,border:"1px solid #C9D8E8",color:"var(--navy)",background:"#F8FAFC"}}
                            defaultValue={tagInfo?.tag||""}
                            onChange={e=>e.target.value&&handleTagChange(doc.path,e.target.value)}>
                            <option value="">{tagInfo?.tag||"— Tag —"}</option>
                            {DOC_TAGS.map(t=><option key={t} value={t}>{t}</option>)}
                          </select>
                          <span style={{color:"var(--sub)"}}>{formatBytes(doc.metadata?.size)}</span>
                          {doc.created_at&&<span style={{color:"var(--sub)"}}>{new Date(doc.created_at).toLocaleDateString("en-GB")}</span>}
                        </div>
                      </div>
                      <div className="doc-actions">
                        <button className="btn btn-outline btn-sm" onClick={async()=>{const url=await getSignedUrl(doc.path,token);if(url)setViewerDoc({url,name:displayName});}}>👁 View</button>
                        <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(doc.path,folderName)}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {viewerDoc&&<DocViewer url={viewerDoc.url} name={viewerDoc.name} onClose={()=>setViewerDoc(null)}/>}
    </div>
  );
}


// ─── Archive Page ─────────────────────────────────────────────────────────────
function DocCount({archiveId, token}){
  const [count,setCount]=useState(null);
  useEffect(()=>{
    listDocuments("archive/"+archiveId,token).then(d=>{
      setCount(Array.isArray(d)?d.length:0);
    });
  },[archiveId,token]);
  if(count===null) return null;
  return <span style={{marginLeft:8,color:count>0?"var(--navy)":"var(--sub)",fontWeight:count>0?600:400}}>
    {count>0?`📎 ${count} doc${count!==1?"s":""}`:""}</span>;
}

function ArchivePage({token,onRestore,onPermanentDelete,orgId,showToast,onAudit}){
  const [archived,setArchived]=useState([]);
  const [deleted,setDeleted]=useState([]);
  const [tab,setTab]=useState("archived");
  const [loading,setLoading]=useState(true);
  const [viewRecord,setViewRecord]=useState(null); // {data, name, archiveId}
  const [viewDocs,setViewDocs]=useState(null); // {archiveId, name}

  async function reload(){
    const [a,d]=await Promise.all([archiveList(token,orgId),dbGetDeleted(token,orgId)]);
    setArchived(Array.isArray(a)?a:[]);
    setDeleted(Array.isArray(d)?d:[]);
    setLoading(false);
  }

  useEffect(()=>{
    if(!orgId) return;
    Promise.all([archiveList(token,orgId),dbGetDeleted(token,orgId)]).then(([a,d])=>{
      setArchived(Array.isArray(a)?a:[]);
      setDeleted(Array.isArray(d)?d:[]);
      setLoading(false);
    });
  },[token,orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function restore(id, isDeleted=false){await onRestore(id, isDeleted);reload();}
  async function permDelete(id, isDeleted=false){await onPermanentDelete(id, isDeleted);reload();}

  function daysLeft(ts){
    if(!ts) return "";
    const days=30-Math.floor((Date.now()-new Date(ts).getTime())/86400000);
    return days<=0?"Expires today":`${days} days left`;
  }

  function ArchivedRow({record}){
    const t=record.tenant_data||{};
    const name=t.tenant||t.label||("Unit "+record.original_unit_id);
    const archivedDate=new Date(record.archived_at).toLocaleDateString("en-GB");
    return(
      <div className="doc-item">
        <div className="doc-icon">{t.category==="Residential"?"🏠":t.category==="Commercial"?"🏢":"📦"}</div>
        <div className="doc-info">
          <div className="doc-name">{name}</div>
          <div className="doc-meta">
            Unit {record.original_unit_id}
            {t.row_name&&` · ${t.row_name}`}
            {t.rent&&` · £${t.rent}/mo`}
            {t.email&&` · ${t.email}`}
            <span style={{marginLeft:8,color:"var(--sub)"}}>Archived {archivedDate}</span>
            <DocCount archiveId={record.id} token={token}/>
          </div>
        </div>
        <div className="doc-actions">
          <button className="btn btn-outline btn-sm" onClick={()=>setViewRecord({data:t,name,archiveId:record.id})}>📋 Details</button>
          <button className="btn btn-outline btn-sm" onClick={()=>setViewDocs({archiveId:record.id,name})}>📁 Docs</button>
          <button className="btn btn-success btn-sm" onClick={()=>restore(record.id)}>↩️ Restore</button>
          <button className="btn btn-danger btn-sm" onClick={()=>permDelete(record.id)}>🗑️ Delete</button>
        </div>
      </div>
    );
  }

  function DeletedRow({t}){
    const orig=t.deleted_data?JSON.parse(t.deleted_data):t;
    const name=orig.tenant||orig.label||("Unit "+t.id);
    return(
      <div className="doc-item">
        <div className="doc-icon">{t.category==="Residential"?"🏠":t.category==="Commercial"?"🏢":"📦"}</div>
        <div className="doc-info">
          <div className="doc-name">{name}</div>
          <div className="doc-meta">
            Unit {t.id} · {t.category}
            {orig.row_name&&` · ${orig.row_name}`}
            {orig.rent&&` · £${orig.rent}/mo`}
            {t.deleted_at&&<span style={{color:"#C0392B",marginLeft:8}}>⏱ {daysLeft(t.deleted_at)}</span>}
          </div>
        </div>
        <div className="doc-actions">
          <button className="btn btn-success btn-sm" onClick={()=>restore(t.id, true)}>↩️ Restore</button>
          <button className="btn btn-danger btn-sm" onClick={()=>permDelete(t.id, true)}>🗑️ Delete</button>
        </div>
      </div>
    );
  }

  return(
    <div>
      <div className="fr" style={{gap:8,marginBottom:20}}>
        <button className={`btn btn-sm ${tab==="archived"?"btn-primary":"btn-outline"}`} onClick={()=>setTab("archived")}>
          📦 Archived Tenants {archived.length>0&&`(${archived.length})`}
        </button>
        <button className={`btn btn-sm ${tab==="deleted"?"btn-primary":"btn-outline"}`} onClick={()=>setTab("deleted")}>
          🗑️ Recently Deleted {deleted.length>0&&`(${deleted.length})`}
        </button>
      </div>

      {loading&&<div className="loading">⏳ Loading…</div>}

      {!loading&&tab==="archived"&&(
        <div className="card">
          <div className="ch">
            <div className="ct">📦 Archived Tenants</div>
            <span className="chip">{archived.length} records</span>
          </div>
          {archived.length===0?(
            <div className="cb" style={{textAlign:"center",padding:30,color:"var(--sub)"}}>
              <div style={{fontSize:32,marginBottom:8}}>📦</div>
              No archived tenants yet. Use the Archive button in a tenant&apos;s Edit screen to archive a departed tenant.
            </div>
          ):(
            <div style={{padding:0}}>
              {archived.map(r=><ArchivedRow key={r.id} record={r}/>)}
            </div>
          )}
        </div>
      )}

      {!loading&&tab==="deleted"&&(
        <div className="card">
          <div className="ch">
            <div className="ct">🗑️ Recently Deleted</div>
            <span className="chip">Auto-purged after 30 days</span>
          </div>
          {deleted.length===0?(
            <div className="cb" style={{textAlign:"center",padding:30,color:"var(--sub)"}}>No recently deleted records</div>
          ):(
            <div style={{padding:0}}>
              {deleted.map(t=><DeletedRow key={t.id} t={t}/>)}
            </div>
          )}
        </div>
      )}
      {/* Tenant Details Modal */}
      {viewRecord&&(
        <div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setViewRecord(null)}>
          <div className="modal" style={{maxWidth:540}}>
            <div className="mh">
              <div className="mt">📋 {viewRecord.name}</div>
              <button className="mc" onClick={()=>setViewRecord(null)}>✕</button>
            </div>
            <div style={{padding:"16px 22px"}}>
              <div className="dgrid" style={{gridTemplateColumns:"1fr 1fr",gap:"10px 20px"}}>
                {[
                  ["Unit ID", viewRecord.data.id||viewRecord.data.label||"—"],
                  ["Category", viewRecord.data.category||"—"],
                  ["Status at archive", viewRecord.data.status||"—"],
                  ["Row / Location", viewRecord.data.row_name||"—"],
                  ["Email", viewRecord.data.email||"—"],
                  ["Phone", viewRecord.data.phone||"—"],
                  ["Rent (ex-VAT)", viewRecord.data.rent?`£${viewRecord.data.rent}/mo`:"—"],
                  ["Rent (inc-VAT)", viewRecord.data.vat_rent?`£${viewRecord.data.vat_rent}/mo`:"—"],
                  ["Payment method", viewRecord.data.payment||"—"],
                  ["Move-in date", viewRecord.data.move_in_date||"—"],
                  ["Move-out date", viewRecord.data.move_out_date||"—"],
                  ["Key number", viewRecord.data.key_number||"—"],
                  ["Lock deposit paid", viewRecord.data.lock_deposit_paid||"—"],
                  ["Lock deposit amount", viewRecord.data.lock_deposit_amount?`£${viewRecord.data.lock_deposit_amount}`:"—"],
                  ["Tenant deposit", viewRecord.data.tenant_deposit?`£${viewRecord.data.tenant_deposit}`:"—"],
                  ["Address", viewRecord.data.address||"—"],
                ].map(([k,v])=>(
                  <div key={k}>
                    <div style={{fontSize:10,fontWeight:600,color:"var(--sub)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>{k}</div>
                    <div style={{fontSize:13,color:"var(--text)"}}>{v}</div>
                  </div>
                ))}
              </div>
              {viewRecord.data.notes&&(
                <div style={{marginTop:16,paddingTop:14,borderTop:"1px solid #E4EAF2"}}>
                  <div style={{fontSize:10,fontWeight:600,color:"var(--sub)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Notes</div>
                  <div style={{fontSize:13,color:"var(--text)",whiteSpace:"pre-wrap"}}>{viewRecord.data.notes}</div>
                </div>
              )}
              <div style={{marginTop:16,textAlign:"right"}}>
                <button className="btn btn-outline btn-sm" onClick={()=>{setViewDocs({archiveId:viewRecord.archiveId,name:viewRecord.name});setViewRecord(null);}}>📁 View Documents</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Documents Modal */}
      {viewDocs&&(
        <div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setViewDocs(null)}>
          <div className="modal" style={{maxWidth:600}}>
            <div className="mh">
              <div className="mt">📁 Documents — {viewDocs.name}</div>
              <button className="mc" onClick={()=>setViewDocs(null)}>✕</button>
            </div>
            <div style={{padding:"16px 22px"}}>
              <TenantDocuments tenantId={"archive/"+viewDocs.archiveId} token={token} orgId={orgId} showToast={showToast} onAudit={onAudit}/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Enquiries / CRM ─────────────────────────────────────────────────
const ENQUIRY_STATUSES={
  reserved:"🔒 Reserved",
  waiting:"⏳ Waiting",
  contacted:"📞 Contacted",
  converted:"✅ Converted",
  lost:"❌ Found elsewhere",
  withdrawn:"🚫 No longer interested",
  archived:"📦 Archived",
};

function EnquiriesPage({token,data,orgId,onDataRefresh,showToast,onAudit}){
  const [enquiries,setEnquiries]=useState([]);
  const [loading,setLoading]=useState(true);
  const [statusFilter,setStatusFilter]=useState("all");
  const [catFilter,setCatFilter]=useState("all");
  const [showForm,setShowForm]=useState(false);
  const [editItem,setEditItem]=useState(null);
  const [form,setForm]=useState({name:"",email:"",phone:"",category:"Storage",size_needed:"",notes:"",status:"waiting",enquiry_date:new Date().toISOString().slice(0,10),follow_up_date:"",earmarked_unit:""});
  const [saving,setSaving]=useState(false);
  const [convertEnquiry,setConvertEnquiry]=useState(null); // enquiry being converted to tenant
  const [convertUnit,setConvertUnit]=useState(""); // unit ID chosen for conversion
  const [viewDocsEnquiry,setViewDocsEnquiry]=useState(null); // enquiry whose docs are being viewed

  const u=k=>e=>setForm(f=>({...f,[k]:e.target.value}));

  useEffect(()=>{
    enquiryList(token, orgId).then(d=>{setEnquiries(Array.isArray(d)?d:[]);setLoading(false);});
  },[token, orgId]);

  // Vacant units matching the enquiry's category
  function matchingVacantUnits(enq){
    return (data||[]).filter(u=>
      (u.status==="available"||u.status==="vacant"||(!u.status&&!u.tenant))&&
      (!enq.category||u.category===enq.category)
    ).sort((a,b)=>(a.id||"").localeCompare(b.id||""));
  }

  async function handleConvert(){
    if(!convertUnit){showToast("Please select a unit first");return;}
    // Find the unit record
    const unit=data.find(u=>u.id===convertUnit);
    if(!unit){showToast("Unit not found");return;}
    // Hard block — only allow if unit is vacant or available
    const occupiedStatuses=["occupied","arrears","leaving","new"];
    if(occupiedStatuses.includes(unit.status)||unit.tenant){
      showToast(`❌ Unit ${convertUnit} is occupied by ${unit.tenant||"a tenant"} — choose a vacant unit`);
      return;
    }
    if(!window.confirm(`Convert ${convertEnquiry.name} to a tenant in unit ${convertUnit}?`)) return;
    try{
      await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(convertUnit)}&org_id=eq.${orgId}`,{
        method:"PATCH",
        headers:{...authH(token),Prefer:"return=minimal"},
        body:JSON.stringify({tenant:convertEnquiry.name,email:convertEnquiry.email||"",phone:convertEnquiry.phone||"",status:"new",move_in_date:new Date().toISOString().slice(0,10),notes:convertEnquiry.notes||""})
      });
      // Update enquiry status and close
      await enquiryUpdate(convertEnquiry.id,{status:"converted"},token);
      setEnquiries(enq=>enq.map(e=>e.id===convertEnquiry.id?{...e,status:"converted"}:e));
      if(onAudit) onAudit("convert","enquiry",convertEnquiry.id,convertEnquiry.name,{unit_id:convertUnit,category:convertEnquiry.category});
      setConvertEnquiry(null);
      setConvertUnit("");
      if (onDataRefresh) onDataRefresh();
      showToast(`✅ ${convertEnquiry.name} added to unit ${convertUnit} — complete their details on the Tenants page`);
    }catch(e){showToast("Conversion failed: "+e.message);}
  }

  async function reload(){
    const d=await enquiryList(token,orgId);
    setEnquiries(Array.isArray(d)?d:[]);
  }

  function openAdd(){
    setForm({name:"",email:"",phone:"",category:"Storage",size_needed:"",notes:"",status:"waiting",enquiry_date:new Date().toISOString().slice(0,10),follow_up_date:"",earmarked_unit:""});
    setEditItem(null);
    setShowForm(true);
  }

  function openEdit(e){
    setForm({...e,enquiry_date:e.enquiry_date||"",follow_up_date:e.follow_up_date||"",earmarked_unit:e.earmarked_unit||""});
    setEditItem(e);
    setShowForm(true);
  }

  async function handleSave(){
    setSaving(true);
    if(editItem){
      await enquiryUpdate(editItem.id,form,token);
      await reload();
      setShowForm(false);
    } else {
      const saved=await enquirySave(form,token,orgId);
      const newRecord=Array.isArray(saved)?saved[0]:saved;
      await reload();
      // Keep form open with the new record so documents can be uploaded
      if(newRecord?.id){
        setEditItem({...form,id:newRecord.id});
        setForm(f=>({...f,id:newRecord.id}));
      } else {
        setShowForm(false);
      }
    }
    setSaving(false);
  }

  async function handleDelete(id){
    if(!window.confirm("Remove this enquiry? This cannot be undone.")) return;
    // Also delete any documents stored for this enquiry
    try{
      const docs=await listDocuments("enquiry_"+id,token);
      for(const doc of (Array.isArray(docs)?docs:[])){
        await deleteDocument(`enquiry_${id}/${doc.name}`,token);
      }
    }catch(e){}
    await enquiryDelete(id,token);
    await reload();
  }

  async function handleArchiveEnquiry(id){
    const e=enquiries.find(x=>x.id===id);
    if(!e) return;
    if(!window.confirm(`Archive enquiry for "${e.name}"?\n\nTheir details and documents will be saved and can be restored at any time.`)) return;
    // Move documents to archive folder
    const srcFolder=`enquiry_${id}`;
    const dstFolder=`enquiry_archive/${id}`;
    try{
      const docs=await listDocuments(srcFolder,token);
      for(const doc of (Array.isArray(docs)?docs:[])){
        await fetch(`${SUPABASE_URL}/storage/v1/object/copy`,{
          method:"POST",
          headers:{...BASE_H,Authorization:`Bearer ${token}`},
          body:JSON.stringify({bucketId:"documents",sourceKey:`${srcFolder}/${doc.name}`,destinationKey:`${dstFolder}/${doc.name}`,destinationBucket:"documents"})
        });
        await deleteDocument(`${srcFolder}/${doc.name}`,token);
        // Update document tags
        await fetch(`${SUPABASE_URL}/rest/v1/document_tags?file_path=eq.${encodeURIComponent(`${srcFolder}/${doc.name}`)}`,{
          method:"PATCH",
          headers:{"Content-Type":"application/json",apikey:SUPABASE_KEY,Prefer:"return=minimal"},
          body:JSON.stringify({file_path:`${dstFolder}/${doc.name}`})
        });
      }
    }catch(e){}
    await enquiryUpdate(id,{status:"archived"},token);
    await reload();
    setShowForm(false);
  }

  async function handleRestoreEnquiry(id){
    // Move documents back from archive folder
    const srcFolder=`enquiry_archive/${id}`;
    const dstFolder=`enquiry_${id}`;
    try{
      const docs=await listDocuments(srcFolder,token);
      for(const doc of (Array.isArray(docs)?docs:[])){
        await fetch(`${SUPABASE_URL}/storage/v1/object/copy`,{
          method:"POST",
          headers:{...BASE_H,Authorization:`Bearer ${token}`},
          body:JSON.stringify({bucketId:"documents",sourceKey:`${srcFolder}/${doc.name}`,destinationKey:`${dstFolder}/${doc.name}`,destinationBucket:"documents"})
        });
        await deleteDocument(`${srcFolder}/${doc.name}`,token);
        await fetch(`${SUPABASE_URL}/rest/v1/document_tags?file_path=eq.${encodeURIComponent(`${srcFolder}/${doc.name}`)}`,{
          method:"PATCH",
          headers:{"Content-Type":"application/json",apikey:SUPABASE_KEY,Prefer:"return=minimal"},
          body:JSON.stringify({file_path:`${dstFolder}/${doc.name}`})
        });
      }
    }catch(e){}
    await enquiryUpdate(id,{status:"waiting"},token);
    await reload();
  }

  async function quickStatus(id,status){
    await enquiryUpdate(id,{status},token);
    setEnquiries(e=>e.map(x=>x.id===id?{...x,status}:x));
  }

  const filtered=enquiries.filter(e=>{
    const ms=statusFilter==="all"?e.status!=="archived":e.status===statusFilter;
    const mc=catFilter==="all"||e.category===catFilter;
    return ms&&mc;
  });

  const waiting=enquiries.filter(e=>e.status==="waiting");
  const contacted=enquiries.filter(e=>e.status==="contacted");

  function daysSince(dateStr){
    if(!dateStr) return null;
    const days=Math.floor((Date.now()-new Date(dateStr).getTime())/86400000);
    return days;
  }

  function urgencyColor(e){
    const days=daysSince(e.enquiry_date);
    if(days>60) return "#C0392B";
    if(days>30) return "#E67E22";
    return "var(--sub)";
  }

  return(
    <div>
      {/* Summary cards */}
      <div className="kg" style={{gridTemplateColumns:"repeat(3,1fr)",marginBottom:20}}>
        <div className="kc"><div className="kl">Waiting</div><div className="kv">{waiting.length}</div><div className="ks">Active enquiries</div><div className="ki">⏳</div></div>
        <div className="kc"><div className="kl">Contacted</div><div className="kv">{contacted.length}</div><div className="ks">Awaiting response</div><div className="ki">📞</div></div>
        <div className="kc"><div className="kl">Total Enquiries</div><div className="kv">{enquiries.length}</div><div className="ks">All time</div><div className="ki">📋</div></div>
      </div>

      {/* Filters and add button */}
      <div className="fb mb20" style={{flexWrap:"wrap",gap:8}}>
        <div className="fr" style={{flexWrap:"wrap",gap:6}}>
          <button className={`btn btn-sm ${statusFilter==="all"?"btn-primary":"btn-outline"}`} onClick={()=>setStatusFilter("all")}>All</button>
          {Object.entries(ENQUIRY_STATUSES).map(([k,v])=>(
            <button key={k} className={`btn btn-sm ${statusFilter===k?"btn-primary":"btn-outline"}`} onClick={()=>setStatusFilter(k)}>{v}</button>
          ))}
        </div>
        <div className="fr" style={{gap:6}}>
          {["all","Storage","Residential","Commercial"].map(c=>(
            <button key={c} className={`btn btn-sm ${catFilter===c?"btn-navy":"btn-outline"}`} onClick={()=>setCatFilter(c)}>{c==="all"?"All":c}</button>
          ))}
          <button className="btn btn-primary" onClick={openAdd}>+ Add Enquiry</button>
        </div>
      </div>

      {loading&&<div className="loading">⏳ Loading…</div>}

      {!loading&&filtered.length===0&&(
        <div className="card"><div className="cb" style={{textAlign:"center",padding:40,color:"var(--sub)"}}>
          <div style={{fontSize:36,marginBottom:10}}>📋</div>
          <div style={{fontWeight:600,color:"var(--navy)"}}>No enquiries found</div>
          <div style={{fontSize:13,marginTop:6}}>Click + Add Enquiry to record your first CRM entry.</div>
        </div></div>
      )}

      {!loading&&filtered.length>0&&(
        <div className="card">
          <div className="tw"><table>
            <thead><tr>
              <th>Name</th><th>Contact</th><th>Category</th><th>Size Needed</th>
              <th>Enquiry Date</th><th>Days Waiting</th><th>Status</th><th>Notes</th><th></th>
            </tr></thead>
            <tbody>{filtered.map(e=>(
              <tr key={e.id}>
                <td style={{fontWeight:600,color:"var(--navy)",whiteSpace:"nowrap"}}>{e.name}</td>
                <td style={{fontSize:12}}>
                  {e.email&&<div>{e.email}</div>}
                  {e.phone&&<div style={{color:"var(--sub)"}}>{e.phone}</div>}
                </td>
                <td><span className="chip">{e.category}</span></td>
                <td style={{fontSize:12}}>{e.size_needed||"—"}</td>
                <td style={{fontSize:12,whiteSpace:"nowrap"}}>{e.enquiry_date?new Date(e.enquiry_date).toLocaleDateString("en-GB"):"—"}</td>
                <td style={{fontWeight:600,color:urgencyColor(e)}}>
                  {daysSince(e.enquiry_date)!=null?daysSince(e.enquiry_date)+" days":"—"}
                  {e.status==="reserved"&&e.earmarked_unit&&(
                    <div style={{fontSize:10,color:"#7A5C00",fontWeight:600,marginTop:2}}>🔒 {e.earmarked_unit}</div>
                  )}
                </td>
                <td>
                  <select value={e.status} onChange={ev=>quickStatus(e.id,ev.target.value)}
                    style={{fontSize:11,padding:"3px 6px",borderRadius:5,border:"1px solid #C9D8E8",color:"var(--navy)"}}>
                    {Object.entries(ENQUIRY_STATUSES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td style={{fontSize:11,color:"var(--sub)",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.notes||"—"}</td>
                <td>
                  <div className="fr" style={{gap:4}}>
                    <button className="btn btn-outline btn-sm" onClick={()=>openEdit(e)}>Edit</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>setViewDocsEnquiry(e)} title="View documents">📁</button>
                    {(e.status==="waiting"||e.status==="contacted"||e.status==="reserved")&&(
                      <button className="btn btn-success btn-sm" onClick={()=>{setConvertEnquiry(e);setConvertUnit(e.earmarked_unit||"");}}>🏠 Convert</button>
                    )}
                    {e.status==="archived"?(
                      <button className="btn btn-success btn-sm" onClick={()=>handleRestoreEnquiry(e.id)}>↩️ Restore</button>
                    ):(
                      <button className="btn btn-outline btn-sm" style={{color:"#7B6F3A"}} onClick={()=>handleArchiveEnquiry(e.id)}>📦</button>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(e.id)}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
          <div style={{padding:"8px 16px",fontSize:12,color:"var(--sub)",borderTop:"1px solid #E4EAF2"}}>{filtered.length} enquiries shown</div>
        </div>
      )}

      {/* Enquiry Documents Modal */}
      {viewDocsEnquiry&&(
        <div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setViewDocsEnquiry(null)}>
          <div className="modal" style={{maxWidth:600}}>
            <div className="mh">
              <div className="mt">📁 Documents — {viewDocsEnquiry.name}</div>
              <button className="mc" onClick={()=>setViewDocsEnquiry(null)}>✕</button>
            </div>
            <div style={{padding:"16px 22px"}}>
              <TenantDocuments tenantId={"enquiry_"+viewDocsEnquiry.id} token={token} orgId={orgId} showToast={showToast} onAudit={onAudit}/>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Tenant Modal */}
      {convertEnquiry&&(
        <div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setConvertEnquiry(null)}>
          <div className="modal" style={{maxWidth:480}}>
            <div className="mh">
              <div className="mt">Convert to Tenant — {convertEnquiry.name}</div>
              <button className="mc" onClick={()=>setConvertEnquiry(null)}>✕</button>
            </div>
            <div style={{padding:"20px 22px"}}>
              <div style={{fontSize:13,color:"var(--sub)",marginBottom:16}}>
                {convertEnquiry.category} · {convertEnquiry.size_needed||"No size specified"} · {convertEnquiry.email||""} {convertEnquiry.phone?`· ${convertEnquiry.phone}`:""}
              </div>
              {(()=>{
                const vacant=matchingVacantUnits(convertEnquiry);
                if(vacant.length===0) return(
                  <div style={{background:"#FFF8E1",border:"1.5px solid #FFD54F",borderRadius:8,padding:"14px",fontSize:13,color:"#7A5C00",marginBottom:16}}>
                    ⚠️ No vacant {convertEnquiry.category} units available right now. Change a unit status to Available on the Site Plan first.
                  </div>
                );
                return(
                  <>
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:12,fontWeight:600,color:"var(--navy)",display:"block",marginBottom:8}}>Select unit to assign</label>
                      <select value={convertUnit} onChange={e=>setConvertUnit(e.target.value)}
                        style={{width:"100%",fontFamily:"var(--fb)",fontSize:13,padding:"9px 12px",border:"1.5px solid #D0DAE8",borderRadius:7,outline:"none"}}>
                        <option value="">— Choose a vacant unit —</option>
                        {vacant.map(u=>(
                          <option key={u.id} value={u.id}>{u.label||u.id} {u.size?`· ${u.size}`:""} {u.row_name?`· ${u.row_name}`:""}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{background:"#EAF3DE",border:"1px solid #B5D98A",borderRadius:7,padding:"10px 14px",fontSize:12,color:"#3B6D11",marginBottom:16}}>
                      ℹ️ This will set the tenant name, email, phone and status to New in the selected unit. You can complete the rest of their details from the Site Plan.
                    </div>
                  </>
                );
              })()}
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button className="btn btn-outline" onClick={()=>setConvertEnquiry(null)}>Cancel</button>
                <button className="btn btn-success" onClick={handleConvert} disabled={!convertUnit}>✅ Convert to Tenant</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm&&(
        <div className="modal-ov" onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div className="modal">
            <div className="mh">
              <div className="mt">{editItem?"Edit Enquiry":"New Enquiry"}</div>
              <button className="mc" onClick={()=>setShowForm(false)}>✕</button>
            </div>
            <div className="mb-m">
              <div className="fg">
                <div className="fgi full"><label>Name *</label><input value={form.name} onChange={u("name")} placeholder="Full name" autoFocus/></div>
                <div className="fgi"><label>Email</label><input type="email" value={form.email} onChange={u("email")} placeholder="email@example.com"/></div>
                <div className="fgi"><label>Phone</label><input value={form.phone} onChange={u("phone")} placeholder="07700 000000"/></div>
                <div className="fgi"><label>Category</label>
                  <select value={form.category} onChange={u("category")}>
                    {["Storage","Residential","Commercial"].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="fgi"><label>Size Needed</label><input value={form.size_needed} onChange={u("size_needed")} placeholder="e.g. Small, XL, 2-bed"/></div>
                <div className="fgi"><label>Enquiry Date</label><input type="date" value={form.enquiry_date} onChange={u("enquiry_date")}/></div>
                <div className="fgi"><label>Follow-up Date</label><input type="date" value={form.follow_up_date||""} onChange={u("follow_up_date")}/></div>
                <div className="fgi"><label>Status</label>
                  <select value={form.status} onChange={u("status")}>
                    {Object.entries(ENQUIRY_STATUSES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {form.status==="reserved"&&(
                    <div className="fgi full"><label>Earmarked Unit (optional)</label>
                      <select value={form.earmarked_unit||""} onChange={u("earmarked_unit")}>
                        <option value="">— Select a unit —</option>
                        {(data||[]).filter(d=>d.status==="leaving"||d.status==="available"||d.status==="vacant"||!d.tenant)
                          .sort((a,b)=>(a.id||"").localeCompare(b.id||""))
                          .map(d=><option key={d.id} value={d.id}>{d.label||d.id}{d.tenant?` (${d.tenant})`:""} · {d.status||"vacant"}</option>)
                        }
                      </select>
                    </div>
                  )}
                <div className="fgi full"><label>Notes</label><textarea value={form.notes} onChange={u("notes")} placeholder="Notes from conversations, preferences, special requirements…" style={{minHeight:80}}/></div>
              </div>
              {(editItem||form.id)&&(
                <div style={{borderTop:"1px solid #E4EAF2",paddingTop:16,marginTop:4}}>
                  <div style={{fontFamily:"var(--fh)",fontSize:13,fontWeight:700,color:"var(--navy)",marginBottom:12}}>📧 Email Correspondence</div>
                  <TenantDocuments tenantId={"enquiry_"+(editItem?.id||form.id)} token={token} orgId={orgId} showToast={showToast} onAudit={onAudit}/>
                </div>
              )}
            </div>
            <div className="mf">
              {editItem&&<button className="btn btn-outline" style={{color:"#7B6F3A"}} onClick={()=>handleArchiveEnquiry(editItem.id)}>📦 Archive</button>}
              {editItem&&<button className="btn btn-danger" onClick={()=>{handleDelete(editItem.id);}}>Delete</button>}
              <button className="btn btn-outline" onClick={()=>setShowForm(false)}>{(editItem||form.id)?"Close":"Cancel"}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving||!form.name}>{saving?"Saving…":editItem?"Save":"Save & Continue"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Super Admin Page ─────────────────────────────────────────────────────────
function SuperAdminPage({ token, session, onImpersonate }) {
  const [orgs, setOrgs] = useState([]);
  const [orgUsers, setOrgUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [superAdmins, setSuperAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [msg, setMsg] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [newSuperAdmin, setNewSuperAdmin] = useState("");
  const [showSuperAdmins, setShowSuperAdmins] = useState(false);

  useEffect(() => {
    if (!token) return;
    reload();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function reload() {
    Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/organisations?order=created_at.desc`, { headers: authH(token) }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/org_users?order=invited_at.desc`, { headers: authH(token) }).then(r => r.json()),
      fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "listUsers" }) }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/super_admins?order=created_at.asc`, { headers: authH(token) }).then(r => r.ok ? r.json() : []),
    ]).then(([o, ou, u, sa]) => {
      setOrgs(Array.isArray(o) ? o : []);
      setOrgUsers(Array.isArray(ou) ? ou : []);
      setAllUsers(Array.isArray(u.users) ? u.users : []);
      setSuperAdmins(Array.isArray(sa) ? sa : []);
      setLoading(false);
    });
  }

  async function handleInviteCustomer() {
    if (!inviteEmail.trim()) return;
    setInviting(true); setMsg("");
    const tempPass = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase() + "!1";
    try {
      const d = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createUser", email: inviteEmail.trim(), password: tempPass }),
      }).then(r => r.json());
      if (d.error) throw new Error(d.error_description || d.msg || d.error);
      // Send welcome email
      await fetch("/api/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: inviteEmail.trim(), tempPassword: tempPass }),
      });
      setMsg(`✅ Invitation sent to ${inviteEmail.trim()} — they will be prompted to set up their business on first login`);
      setInviteEmail("");
      setShowInvite(false);
      await reload();
    } catch (e) {
      setMsg(`❌ Could not invite — ${e.message}`);
    }
    setInviting(false);
  }

  const [showAuditLog, setShowAuditLog] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditOrg, setAuditOrg] = useState("all");

  async function loadAuditLog() {
    setAuditLoading(true);
    const url = auditOrg === "all"
      ? `${SUPABASE_URL}/rest/v1/audit_log?order=created_at.desc&limit=200`
      : `${SUPABASE_URL}/rest/v1/audit_log?org_id=eq.${auditOrg}&order=created_at.desc&limit=200`;
    const r = await fetch(url, { headers: authH(token) });
    const rows = await r.json();
    setAuditLogs(Array.isArray(rows) ? rows : []);
    setAuditLoading(false);
  }

  useEffect(() => {
    if (showAuditLog) loadAuditLog();
  }, [showAuditLog, auditOrg]); // eslint-disable-line react-hooks/exhaustive-deps

  const ACTION_COLORS = {
    create: { bg: "#EBF5F0", color: "var(--success)" },
    update: { bg: "#EEF4FF", color: "#3B5FA0" },
    archive: { bg: "#FFF8E6", color: "#7A5C00" },
    restore: { bg: "#F3E5F5", color: "#7B1FA2" },
    delete: { bg: "#FFF0EE", color: "var(--danger)" },
    soft_delete: { bg: "#FFF0EE", color: "var(--danger)" },
    import: { bg: "#EEF4FF", color: "#3B5FA0" },
    login: { bg: "#F5F5F5", color: "#888" },
  };
  const [showCreateTest, setShowCreateTest] = useState(false);
  const [testOrgName, setTestOrgName] = useState("Cerect Test Business");
  const [creatingTest, setCreatingTest] = useState(false);

  async function handleCreateTestOrg() {
    if (!testOrgName.trim()) return;
    setCreatingTest(true);
    try {
      const slug = testOrgName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const r = await fetch(`${SUPABASE_URL}/rest/v1/organisations`, {
        method: "POST",
        headers: { ...authH(token), Prefer: "return=representation" },
        body: JSON.stringify({ name: testOrgName.trim(), slug, plan: "trial" }),
      });
      if (!r.ok) throw new Error(await r.text());
      setMsg(`✅ Test org "${testOrgName.trim()}" created — use 👁 View as to enter it`);
      setShowCreateTest(false);
      setTestOrgName("Cerect Test Business");
      await reload();
    } catch (e) { setMsg(`❌ Failed: ${e.message}`); }
    setCreatingTest(false);
  }

  async function handleAddSuperAdmin() {
    if (!newSuperAdmin.trim()) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/super_admins`, {
        method: "POST",
        headers: { ...authH(token), Prefer: "return=minimal" },
        body: JSON.stringify({ email: newSuperAdmin.trim().toLowerCase() }),
      });
      setMsg(`✅ ${newSuperAdmin.trim()} added as super admin`);
      setNewSuperAdmin("");
      await reload();
    } catch (e) { setMsg(`❌ Failed: ${e.message}`); }
  }

  async function handleRemoveSuperAdmin(id, email) {
    if (!window.confirm(`Remove ${email} as super admin?`)) return;
    await fetch(`${SUPABASE_URL}/rest/v1/super_admins?id=eq.${id}`, {
      method: "DELETE", headers: authH(token),
    });
    setMsg(`✅ ${email} removed`);
    await reload();
  }

  function getUsersForOrg(orgId) {
    const userIds = orgUsers.filter(ou => ou.org_id === orgId).map(ou => ou.user_id);
    return allUsers.filter(u => userIds.includes(u.id));
  }

  function getOrgUser(orgId, userId) {
    return orgUsers.find(ou => ou.org_id === orgId && ou.user_id === userId);
  }

  async function handleArchiveOrg(org) {
    if (!window.confirm(`Archive "${org.name}"?\n\nTheir account will be locked — they cannot log in but all their data and documents are preserved. You can restore them at any time.`)) return;
    await fetch(`${SUPABASE_URL}/rest/v1/organisations?id=eq.${org.id}`, {
      method: "PATCH",
      headers: { ...authH(token), Prefer: "return=minimal" },
      body: JSON.stringify({ plan: "archived" }),
    });
    setOrgs(os => os.map(o => o.id === org.id ? { ...o, plan: "archived" } : o));
    setMsg(`✅ "${org.name}" has been archived — their data is preserved`);
  }

  async function handleSuspend(org) {
    if (!window.confirm(`Suspend "${org.name}"? Their users will not be able to log in.`)) return;
    await fetch(`${SUPABASE_URL}/rest/v1/organisations?id=eq.${org.id}`, {
      method: "PATCH",
      headers: { ...authH(token), Prefer: "return=minimal" },
      body: JSON.stringify({ plan: "suspended" }),
    });
    setOrgs(os => os.map(o => o.id === org.id ? { ...o, plan: "suspended" } : o));
    setMsg(`✅ ${org.name} suspended`);
  }

  async function handleRestore(org) {
    await fetch(`${SUPABASE_URL}/rest/v1/organisations?id=eq.${org.id}`, {
      method: "PATCH",
      headers: { ...authH(token), Prefer: "return=minimal" },
      body: JSON.stringify({ plan: "trial" }),
    });
    setOrgs(os => os.map(o => o.id === org.id ? { ...o, plan: "trial" } : o));
    setMsg(`✅ "${org.name}" restored — they can log in again`);
  }

  async function handleSetPlan(orgId, plan) {
    await fetch(`${SUPABASE_URL}/rest/v1/organisations?id=eq.${orgId}`, {
      method: "PATCH",
      headers: { ...authH(token), Prefer: "return=minimal" },
      body: JSON.stringify({ plan }),
    });
    setOrgs(os => os.map(o => o.id === orgId ? { ...o, plan } : o));
    setMsg(`✅ Plan updated`);
  }

  async function handleDeleteOrg(org) {
    if (!window.confirm(`⚠️ PERMANENTLY DELETE "${org.name}"?\n\nThis will delete:\n• Their organisation record\n• All their org_users entries\n\nThis does NOT delete their tenant data or documents — those remain in the database.\n\nThis cannot be undone. Type the org name to confirm.`)) return;
    const confirm2 = window.prompt(`Type "${org.name}" to confirm permanent deletion:`);
    if (confirm2 !== org.name) { setMsg("❌ Deletion cancelled — name did not match"); return; }
    try {
      // Remove org_users first
      await fetch(`${SUPABASE_URL}/rest/v1/org_users?org_id=eq.${org.id}`, {
        method: "DELETE", headers: authH(token),
      });
      // Remove organisation
      await fetch(`${SUPABASE_URL}/rest/v1/organisations?id=eq.${org.id}`, {
        method: "DELETE", headers: authH(token),
      });
      setOrgs(os => os.filter(o => o.id !== org.id));
      setMsg(`✅ "${org.name}" has been permanently deleted`);
    } catch (e) { setMsg(`❌ Delete failed: ${e.message}`); }
  }

  const PLAN_COLORS = {
    trial: { bg: "#FFF8E6", color: "#7A5C00", border: "#F5E0A0" },
    core: { bg: "#EBF5F0", color: "var(--success)", border: "#BDE5D3" },
    professional: { bg: "#EEF4FF", color: "#3B5FA0", border: "#B8D0F8" },
    business: { bg: "#F3E5F5", color: "#7B1FA2", border: "#CE93D8" },
    suspended: { bg: "#FFF0EE", color: "var(--danger)", border: "#FFCDD2" },
    archived: { bg: "#F5F5F5", color: "#888", border: "#DDD" },
  };

  return loading ? (
    <div className="page"><div style={{ textAlign: "center", padding: 40, color: "var(--sub)" }}>Loading…</div></div>
  ) : (
    <div className="page">
      {msg && (
        <div style={{ background: "#EBF5F0", border: "1.5px solid #BDE5D3", borderRadius: 9, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "var(--success)", display: "flex", justifyContent: "space-between" }}>
          {msg} <button onClick={() => setMsg("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--sub)" }}>✕</button>
        </div>
      )}

      {/* Invite new customer */}
      <div className="card" style={{ marginBottom: 20, background: "linear-gradient(135deg, #0F3A52 0%, #1A5276 100%)", color: "#fff", border: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "var(--fh)", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>✉️ Invite a new customer</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Creates their account and sends a welcome email with login instructions. They'll set up their business on first login.</div>
          </div>
          <button onClick={() => setShowInvite(s => !s)} style={{ background: "var(--gold)", color: "var(--navy)", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
            {showInvite ? "✕ Cancel" : "+ Invite Customer"}
          </button>
        </div>
        {showInvite && (
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="customer@theirbusiness.com"
              onKeyDown={e => e.key === "Enter" && handleInviteCustomer()}
              autoFocus
              style={{ flex: 1, fontFamily: "var(--fb)", fontSize: 14, padding: "10px 14px", border: "1.5px solid rgba(255,255,255,0.3)", borderRadius: 8, outline: "none", background: "rgba(255,255,255,0.1)", color: "#fff" }}
            />
            <button onClick={handleInviteCustomer} disabled={inviting || !inviteEmail.trim()} style={{ background: "var(--gold)", color: "var(--navy)", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: inviting ? 0.6 : 1 }}>
              {inviting ? "Sending…" : "Send Invite →"}
            </button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Organisations</div><div className="kpi-value">{orgs.length}</div><div className="kpi-meta">Total accounts</div></div>
        <div className="kpi-card"><div className="kpi-label">Active</div><div className="kpi-value">{orgs.filter(o => o.plan !== "suspended").length}</div><div className="kpi-meta">Trial + paid</div></div>
        <div className="kpi-card"><div className="kpi-label">Paid</div><div className="kpi-value">{orgs.filter(o => ["core","professional","business"].includes(o.plan)).length}</div><div className="kpi-meta">Paying customers</div></div>
        <div className="kpi-card"><div className="kpi-label">Total Users</div><div className="kpi-value">{allUsers.length}</div><div className="kpi-meta">Across all orgs</div></div>
      </div>

      {/* Audit Log */}
      <div className="card" style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: showAuditLog ? "1px solid var(--border)" : "none" }}>
          <div style={{ fontFamily: "var(--fh)", fontWeight: 600, fontSize: 14 }}>📋 Audit Log</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {showAuditLog && (
              <select value={auditOrg} onChange={e => setAuditOrg(e.target.value)}
                style={{ fontSize: 12, padding: "4px 8px", border: "1.5px solid var(--border)", borderRadius: 6, fontFamily: "var(--fb)" }}>
                <option value="all">All organisations</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => setShowAuditLog(s => !s)}>{showAuditLog ? "Hide" : "View Log"}</button>
          </div>
        </div>
        {showAuditLog && (
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {auditLoading && <div style={{ padding: 20, textAlign: "center", color: "var(--sub)", fontSize: 13 }}>Loading…</div>}
            {!auditLoading && auditLogs.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--sub)", fontSize: 13 }}>No audit records yet</div>}
            {!auditLoading && auditLogs.map(log => {
              const orgName = orgs.find(o => o.id === log.org_id)?.name || log.org_id?.slice(0,8) || "—";
              const actionStyle = ACTION_COLORS[log.action] || { bg: "#F5F5F5", color: "#888" };
              return (
                <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: actionStyle.bg, color: actionStyle.color, fontWeight: 700, flexShrink: 0, textTransform: "uppercase" }}>{log.action}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                      {log.entity_label || log.entity_id}
                      <span style={{ color: "var(--sub)", fontWeight: 400 }}> · {log.entity_type}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--sub)" }}>
                      {log.user_email} · {orgName}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--sub)", flexShrink: 0 }}>
                    {new Date(log.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create test org */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "var(--fh)", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🧪 Create Test Organisation</div>
            <div style={{ fontSize: 13, color: "var(--sub)" }}>Create a sandbox org to test the platform. Use 👁 View as to enter it.</div>
          </div>
          <button onClick={() => setShowCreateTest(s => !s)} className="btn btn-outline btn-sm">{showCreateTest ? "✕ Cancel" : "+ Create Test Org"}</button>
        </div>
        {showCreateTest && (
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <input
              value={testOrgName}
              onChange={e => setTestOrgName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreateTestOrg()}
              style={{ flex: 1, fontFamily: "var(--fb)", fontSize: 14, padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8, outline: "none" }}
            />
            <button onClick={handleCreateTestOrg} disabled={creatingTest || !testOrgName.trim()} className="btn btn-navy btn-sm">
              {creatingTest ? "Creating…" : "Create →"}
            </button>
          </div>
        )}
      </div>

      {/* Super admin management */}
      <div className="card" style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: showSuperAdmins ? "1px solid var(--border)" : "none" }}>
          <div style={{ fontFamily: "var(--fh)", fontWeight: 600, fontSize: 14 }}>🔑 Super Admins ({superAdmins.length})</div>
          <button className="btn btn-outline btn-sm" onClick={() => setShowSuperAdmins(s => !s)}>{showSuperAdmins ? "Hide" : "Manage"}</button>
        </div>
        {showSuperAdmins && (
          <div style={{ padding: "14px 18px" }}>
            {superAdmins.map(sa => (
              <div key={sa.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{sa.email}</span>
                {superAdmins.length > 1 && (
                  <button className="btn btn-outline btn-sm" style={{ color: "var(--danger)", fontSize: 11 }} onClick={() => handleRemoveSuperAdmin(sa.id, sa.email)}>Remove</button>
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                type="email"
                value={newSuperAdmin}
                onChange={e => setNewSuperAdmin(e.target.value)}
                placeholder="Add super admin email…"
                onKeyDown={e => e.key === "Enter" && handleAddSuperAdmin()}
                style={{ flex: 1, fontFamily: "var(--fb)", fontSize: 13, padding: "7px 12px", border: "1.5px solid var(--border)", borderRadius: 7, outline: "none" }}
              />
              <button className="btn btn-navy btn-sm" onClick={handleAddSuperAdmin} disabled={!newSuperAdmin.trim()}>Add</button>
            </div>
          </div>
        )}
      </div>

      {/* Org list */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontFamily: "var(--fh)", fontWeight: 600, fontSize: 15 }}>
          All Organisations
        </div>
        {orgs.map(org => {
          const users = getUsersForOrg(org.id);
          const planStyle = PLAN_COLORS[org.plan] || PLAN_COLORS.trial;
          const isSelected = selectedOrg === org.id;
          const trialEnd = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
          const trialDaysLeft = trialEnd ? Math.ceil((trialEnd - new Date()) / 86400000) : null;

          return (
            <div key={org.id}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: isSelected ? "var(--mist)" : "" }}
                onClick={() => setSelectedOrg(isSelected ? null : org.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{org.name}</span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: planStyle.bg, color: planStyle.color, border: `1px solid ${planStyle.border}`, fontWeight: 600 }}>
                      {org.plan || "trial"}
                    </span>
                    {trialDaysLeft !== null && org.plan === "trial" && (
                      <span style={{ fontSize: 11, color: trialDaysLeft <= 3 ? "var(--danger)" : "var(--sub)" }}>
                        {trialDaysLeft > 0 ? `${trialDaysLeft} days left` : "Trial expired"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--sub)" }}>
                    {users.length} user{users.length !== 1 ? "s" : ""} · Created {new Date(org.created_at).toLocaleDateString("en-GB")} · slug: {org.slug}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select
                    value={org.plan || "trial"}
                    onChange={e => { e.stopPropagation(); handleSetPlan(org.id, e.target.value); }}
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 11, padding: "4px 8px", border: "1.5px solid var(--mist2)", borderRadius: 6, fontFamily: "var(--fb)" }}
                  >
                    {["trial", "core", "professional", "business", "suspended"].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {(org.plan === "suspended" || org.plan === "archived")
                    ? <button className="sp-btn" style={{ fontSize: 11, background: "#EBF5F0", color: "var(--success)", borderColor: "#BDE5D3" }} onClick={e => { e.stopPropagation(); handleRestore(org); }}>↩ Restore</button>
                    : <>
                        <button className="sp-btn sp-btn-danger" style={{ fontSize: 11 }} onClick={e => { e.stopPropagation(); handleSuspend(org); }}>⏸ Suspend</button>
                        <button className="sp-btn" style={{ fontSize: 11, background: "#F5F5F5", color: "#888", borderColor: "#DDD" }} onClick={e => { e.stopPropagation(); handleArchiveOrg(org); }}>📦 Archive</button>
                      </>
                  }
                  <button className="sp-btn sp-btn-navy" style={{ fontSize: 11 }} onClick={e => { e.stopPropagation(); onImpersonate(org); }}>👁 View as</button>
                  <button className="sp-btn" style={{ fontSize: 11, color: "var(--danger)", borderColor: "var(--danger)" }} onClick={e => { e.stopPropagation(); handleDeleteOrg(org); }}>🗑️ Delete</button>
                  <span style={{ fontSize: 12, color: "var(--sub)", marginLeft: 4 }}>{isSelected ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Expanded org detail */}
              {isSelected && (
                <div style={{ background: "var(--mist)", borderBottom: "1px solid var(--border)", padding: "14px 18px" }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--navy)" }}>Users in {org.name}</div>
                  {users.length === 0
                    ? <div style={{ fontSize: 13, color: "var(--sub)" }}>No users found for this organisation</div>
                    : users.map(u => {
                        const ou = getOrgUser(org.id, u.id);
                        return (
                          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{u.email}</div>
                              <div style={{ fontSize: 11, color: "var(--sub)" }}>
                                Role: {ou?.role || "—"} ·
                                Joined: {ou?.joined_at ? new Date(ou.joined_at).toLocaleDateString("en-GB") : "—"} ·
                                Last sign in: {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString("en-GB") : "Never"} ·
                                {u.factors?.length > 0 ? " 🔐 MFA on" : " ⚠️ No MFA"}
                              </div>
                            </div>
                          </div>
                        );
                      })
                  }
                </div>
              )}
            </div>
          );
        })}
        {orgs.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: "var(--sub)" }}>No organisations yet</div>}
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

// ─── App Shell ────────────────────────────────────────────────────────────────
const NAV=[
  {section:"Overview"},{id:"dashboard",label:"Dashboard",icon:"📊"},
  {section:"Property"},{id:"site",label:"Site Plan",icon:"🗺️"},{id:"tenants",label:"All Tenants",icon:"👥"},{id:"enquiries",label:"Enquiries",icon:"📋"},
  {section:"Finance"},{id:"payments",label:"Payments",icon:"🧾"},{id:"calendar",label:"Calendar",icon:"📅"},
  {section:"Operations"},{id:"tasks",label:"Tasks & Jobs",icon:"🔧"},
  {section:"Data"},{id:"documents",label:"Documents",icon:"📁"},{id:"tools",label:"Import / Export",icon:"📂"},
  {section:"Admin"},{id:"archive",label:"Archive",icon:"📦"},{id:"users",label:"Users & Security",icon:"🔐"},
];
const TITLES={dashboard:"Dashboard",site:"Site Plan",tenants:"All Tenants",enquiries:"Enquiries",payments:"Payments",calendar:"Calendar",tasks:"Tasks & Jobs",documents:"Documents",tools:"Import / Export",archive:"Archive",users:"Users & Security"};

export default function App(){
  const [session,setSession]=useState(()=>{
    try{const s=localStorage.getItem("cerect_session");return s?JSON.parse(s):null;}catch{return null;}
  });
  const [org, setOrg] = useState(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [impersonating, setImpersonating] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [orgLocked, setOrgLocked] = useState(null); // "archived" | "suspended" | null
  const [page,setPage]=useState("dashboard");
  const [mobileNav,setMobileNav]=useState(false);
  useEffect(()=>{ window.__camSetPage=setPage; return()=>{ delete window.__camSetPage; }; },[setPage]);
  const [globalSearch,setGlobalSearch]=useState("");
  const [showGlobalSearch,setShowGlobalSearch]=useState(false);
  const [data,setData]=useState([]);
  const [areas,setAreas]=useState([]);
  const [enquiries,setEnquiries]=useState([]);
  const [tasks,setTasks]=useState([]);
  const [loading,setLoading]=useState(true);
  const [editItem,setEditItem]=useState(null);
  const [isNew,setIsNew]=useState(false);
  const [toast,setToast]=useState(null);
  const [offline,setOffline]=useState(false);
  // eslint-disable-next-line no-unused-vars
  const { confirm: confirmDialog, Modal: ConfirmModal } = useConfirm();

  const token=session?.access_token;
  const userEmail=session?.user?.email||"";
  const orgId = impersonating ? impersonating.org.id : org?.id;
  const activeOrg = impersonating ? impersonating.org : org;
  const showToast=msg=>{setToast(msg);setTimeout(()=>setToast(null),3200);};

  // Offline detection
  useEffect(()=>{
    const on=()=>{setOffline(false);showToast("✅ Back online");};
    const off=()=>setOffline(true);
    window.addEventListener("online",on);
    window.addEventListener("offline",off);
    return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};
  },[]);

  // Escape key closes edit modal; Ctrl+K opens global search
  useEffect(()=>{
    const handler=e=>{
      if(e.key==="Escape"&&editItem){setEditItem(null);}
      if((e.ctrlKey||e.metaKey)&&e.key==="k"){e.preventDefault();setShowGlobalSearch(s=>!s);}
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[editItem]);

  function handleLogin(sess){
    setSession(sess);
    try{localStorage.setItem("cerect_session",JSON.stringify(sess));}catch{}
    if(sess?.access_token && sess?.user?.email){
      loginLogRecord(sess.user.email, sess.access_token).catch(()=>{});
      // We don't have orgId yet at login time — log after org loads
    }
  }

  function applySession(sess){
    setSession(sess);
    try{localStorage.setItem("cerect_session",JSON.stringify(sess));}catch{}
  }

  // Load org whenever session changes
  useEffect(() => {
    if (!session?.user?.id) return;
    setOrgLoading(true);
    // Check super admin status from DB
    if (session?.user?.email && session?.access_token) {
      checkSuperAdmin(session.user.email, session.access_token)
        .then(result => setIsSuperAdmin(result))
        .catch(() => setIsSuperAdmin(false));
    }
    getOrgForUser(session.user.id, session.access_token).then(async row => {
      if (row?.org_id) {
        const o = await getOrgDetails(row.org_id, session.access_token);
        setOrg(o);
        // Log the login
        auditLog(session.access_token, row.org_id, session.user.email, "login", "user", session.user.id, session.user.email, {});
        // If org is archived or suspended, block access
        if (o?.plan === "archived" || o?.plan === "suspended") {
          setNeedsOnboarding(false);
          setOrgLocked(o.plan);
        } else {
          setNeedsOnboarding(false);
          setOrgLocked(null);
        }
      } else {
        // Super admins don't need an org — send them to super admin panel
        checkSuperAdmin(session.user.email, session.access_token).then(isSA => {
          if (isSA) {
            setNeedsOnboarding(false);
            setPage("superadmin");
          } else {
            setNeedsOnboarding(true);
          }
        }).catch(() => setNeedsOnboarding(true));
      }
      setOrgLoading(false);
    }).catch(() => setOrgLoading(false));
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleImpersonate(targetOrg) {
    setImpersonating({ org: targetOrg, prevData: data, prevAreas: areas, prevEnquiries: enquiries, prevTasks: tasks });
    setLoading(true);
    try {
      const [rows, areaRows, enqRows, taskRows] = await Promise.all([
        dbGet(token, targetOrg.id),
        areasGet(token, targetOrg.id),
        enquiryList(token, targetOrg.id),
        taskList(token, targetOrg.id).catch(() => []),
      ]);
      setData(Array.isArray(rows) ? rows : []);
      setAreas(Array.isArray(areaRows) ? areaRows : []);
      setEnquiries(Array.isArray(enqRows) ? enqRows : []);
      setTasks(Array.isArray(taskRows) ? taskRows : []);
    } catch {}
    setLoading(false);
    setPage("dashboard");
    showToast(`👁 Viewing as ${targetOrg.name}`);
  }

  function handleStopImpersonating() {
    if (!impersonating) return;
    setData(impersonating.prevData);
    setAreas(impersonating.prevAreas);
    setEnquiries(impersonating.prevEnquiries);
    setTasks(impersonating.prevTasks);
    setImpersonating(null);
    setPage("superadmin");
    showToast("✅ Back to your account");
  }

  async function handleSignOut(){
    try{await signOut(token);}catch{}
    setSession(null);
    setOrg(null);
    setNeedsOnboarding(false);
    setImpersonating(null);
    setIsSuperAdmin(false);
    setOrgLocked(null);
    setData([]); setAreas([]); setEnquiries([]); setTasks([]);
    try{localStorage.removeItem("cerect_session");}catch{}
  }

  // Proactively refresh the access token every 50 minutes so the user is
  // never silently logged out mid-work (Supabase tokens expire after 1 hour)
  useEffect(()=>{
    if(!session?.refresh_token) return;
    const interval=setInterval(async()=>{
      try{
        const fresh=await refreshSession(session.refresh_token);
        if(fresh?.access_token) applySession(fresh);
      }catch{}
    }, 50*60*1000); // 50 minutes
    return ()=>clearInterval(interval);
  },[session?.refresh_token]);

  // Also refresh immediately on page visibility restore (tab comes back into focus
  // after being backgrounded for a long time — the most common logout trigger)
  useEffect(()=>{
    async function handleVisibility(){
      if(document.visibilityState!=="visible") return;
      if(!session?.refresh_token) return;
      try{
        const fresh=await refreshSession(session.refresh_token);
        if(fresh?.access_token) applySession(fresh);
      }catch{}
    }
    document.addEventListener("visibilitychange",handleVisibility);
    return ()=>document.removeEventListener("visibilitychange",handleVisibility);
  },[session?.refresh_token]);

  const loadData=useCallback(async()=>{
    if(!token || !orgId){setLoading(false);return;}
    try{
      const [rows, areaRows, enqRows, taskRows]=await Promise.all([
        dbGet(token, orgId),
        areasGet(token, orgId),
        enquiryList(token, orgId),
        taskList(token, orgId).catch(()=>[])
      ]);
      setData(Array.isArray(rows) ? rows : []);
      setEnquiries(Array.isArray(enqRows)?enqRows:[]);
      setTasks(Array.isArray(taskRows)?taskRows:[]);
      if(areaRows&&Array.isArray(areaRows)){
        setAreas(areaRows);
        if(areaRows.length===0&&rows&&rows.length>0){
          const storageRows=[...new Set(rows.filter(d=>d.category==="Storage"&&d.row_name).map(d=>d.row_name))];
          for(let i=0;i<storageRows.length;i++){
            await areasUpsert(storageRows[i],"Storage",i,token,orgId);
          }
          const fresh=await areasGet(token,orgId);
          setAreas(fresh||[]);
        }
      }
    }catch(e){
      setData([]);
      if(e?.message==="SESSION_EXPIRED"){
        if(session?.refresh_token){
          try{
            const fresh=await refreshSession(session.refresh_token);
            if(fresh?.access_token){applySession(fresh);return;}
          }catch{}
        }
        showToast("⚠️ Your session has expired — please sign in again");
        setSession(null);
        try{localStorage.removeItem("cerect_session");}catch{}
      }
    }
    setLoading(false);
  },[token, orgId, session]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    if(token && orgId) loadData();
    else if(!token) setLoading(false);
    else if(token && !orgId && !orgLoading) setLoading(false); // has token but no org yet — orgLoading will trigger loadData when ready
  },[token, orgId, loadData, orgLoading]);

  async function handleSave(row){
    try{
      const clean={...row,
        rent:row.rent?Number(row.rent):null,
        vat_rent:row.vat_rent?Number(row.vat_rent):null,
        lock_deposit_amount:row.lock_deposit_amount?Number(row.lock_deposit_amount):null,
        tenant_deposit:row.tenant_deposit?Number(row.tenant_deposit):null,
      };
      await dbUpsert(clean,token);
      setData(d=>d.map(r=>r.id===clean.id?clean:r));
      auditLog(token,orgId,userEmail,"update","tenant",clean.id,clean.tenant||clean.label||clean.id,{status:clean.status,rent:clean.rent});
      showToast("✅ Saved");
    }
    catch{showToast("❌ Save failed");}
  }
  async function handleSaveNew(row){
    try{
      await dbUpsert(row,token);
      setData(d=>[...d,row]);
      auditLog(token,orgId,userEmail,"create","tenant",row.id,row.tenant||row.label||row.id,{category:row.category,status:row.status});
      showToast("✅ Added");
    }
    catch{showToast("❌ Could not save — check Unit ID is unique");}
  }
  async function handleDelete(id){
    const unit=data.find(r=>r.id===id);
    if(!unit) return;
    const name=unit.tenant||unit.label||("Unit "+unit.id);
    const isStorage=unit.category==="Storage";

    if(isStorage&&unit.tenant){
      // Check if there are documents
      const safeId=(unit.id||"").replace(/[^a-zA-Z0-9._-]/g,"_");
      const docs=await listDocuments(safeId,token);
      const hasDocs=Array.isArray(docs)&&docs.length>0;
      if(hasDocs){
        showToast(`⚠️ Unit ${unit.id} has documents — use Archive instead of Delete to preserve them`);
        return;
      }
      if(!window.confirm(`Remove tenant "${name}" from Unit ${unit.id}?\n\nTip: Use "📦 Archive" instead to keep their details for your records.\n\nClick OK to remove and mark unit as Available.`)) return;
    } else if(isStorage){
      // Empty unit — delete it entirely
      try{
        await dbDelete(unit.id,token);
        setData(d=>d.filter(r=>r.id!==id));
        auditLog(token,orgId,userEmail,"delete","tenant",unit.id,name,{category:unit.category});
        showToast(`🗑️ Unit ${unit.id} deleted`);
      }catch{showToast("❌ Delete failed");}
      return;
    } else {
      // Check for documents before allowing delete
      const safeUnitId=(unit.id||"").replace(/\s+/g,'').replace(/[^a-zA-Z0-9._-]/g,"_");
      const docs=await listDocuments(safeUnitId,token);
      const hasDocs=Array.isArray(docs)&&docs.length>0;
      if(hasDocs){
        showToast(`⚠️ "${name}" has documents — use Archive instead of Delete to preserve them`);
        return;
      }
      if(!window.confirm(`Move "${name}" to Recently Deleted?\n\nThey can be restored from the Archive page within 30 days.`)) return;
    }

    try{
      if(isStorage){
        await archiveSave(unit.id, unit, token, orgId);
        const cleared={...unit,tenant:null,email:null,phone:null,payment:null,
          rent:null,vat_rent:null,status:"available",notes:null,
          lock_deposit_paid:null,lock_deposit_amount:null,tenant_deposit:null,key_number:null,address:null,
          deleted_at:null,deleted_data:null};
        await dbUpsert(cleared,token);
        setData(d=>d.map(r=>r.id===id?cleared:r));
        auditLog(token,orgId,userEmail,"archive","tenant",unit.id,name,{category:unit.category,unit_id:unit.id});
        showToast(`🗑️ "${name}" saved to Archive — unit marked as Available`);
      } else {
        const deleted={...unit,archived:false,deleted_at:new Date().toISOString(),deleted_data:JSON.stringify(unit)};
        await dbUpsert(deleted,token);
        setData(d=>d.filter(r=>r.id!==id));
        auditLog(token,orgId,userEmail,"soft_delete","tenant",unit.id,name,{category:unit.category});
        showToast("🗑️ Moved to Recently Deleted");
      }
    }
    catch{showToast("❌ Delete failed");}
  }

  async function handleArchive(id){
    const unit=data.find(r=>r.id===id);
    if(!unit) return;
    const name=unit.tenant||unit.label||("Unit "+unit.id);
    const isStorage=unit.category==="Storage";
    if(isStorage&&!unit.tenant){showToast("⚠️ No tenant to archive — unit is already vacant");return;}
    // Check if already archived
    const existing=await fetch(`${SUPABASE_URL}/rest/v1/archived_tenants?original_unit_id=eq.${encodeURIComponent(id)}&org_id=eq.${orgId}&order=archived_at.desc`,{headers:authH(token)});
    const existingData=await existing.json();
    if(Array.isArray(existingData)&&existingData.length>0){
      const date=new Date(existingData[0].archived_at).toLocaleDateString("en-GB");
      if(!window.confirm(`⚠️ There is already an archived record for Unit ${id} from ${date}.\n\nArchiving again will create a second record. Continue?`)) return;
    }
    const confirmMsg=isStorage
      ? `Archive "${name}"?\n\nTheir details and documents will be saved in the Archive. The unit will remain on the site plan as Available.`
      : `Archive "${name}"?\n\nTheir details and documents will be saved in the Archive and can be restored at any time.`;
    if(!window.confirm(confirmMsg)) return;
    try{
      const safeData={
        id:unit.id,label:unit.label,tenant:unit.tenant,email:unit.email,
        phone:unit.phone,payment:unit.payment,rent:unit.rent,vat_rent:unit.vat_rent,
        status:unit.status,category:unit.category,row_name:unit.row_name,
        box_no:unit.box_no,size:unit.size,section:unit.section,review:unit.review,
        notes:unit.notes,address:unit.address,lock_deposit_paid:unit.lock_deposit_paid,
        lock_deposit_amount:unit.lock_deposit_amount,tenant_deposit:unit.tenant_deposit,
        key_number:unit.key_number,
        move_in_date:unit.move_in_date
      };
      const saved=await archiveSave(unit.id, safeData, token, orgId);
      if(!saved||saved.error||saved.code){
        throw new Error(saved?.message||saved?.error||"Archive save failed");
      }
      const archiveRecord=Array.isArray(saved)?saved[0]:saved;
      const archiveId=archiveRecord?.id;

      if(isStorage){
        const cleared={...unit,tenant:null,email:null,phone:null,payment:null,
          rent:null,vat_rent:null,status:"available",notes:null,
          lock_deposit_paid:null,lock_deposit_amount:null,tenant_deposit:null,key_number:null,address:null};
        await dbUpsert(cleared,token);
        setData(d=>d.map(r=>r.id===id?cleared:r));
        auditLog(token,orgId,userEmail,"archive","tenant",id,name,{category:unit.category,unit_id:id,archive_id:archiveId});
        showToast(`📦 "${name}" archived — unit marked as Available`);
      } else {
        await dbDelete(id,token);
        setData(d=>d.filter(r=>r.id!==id));
        auditLog(token,orgId,userEmail,"archive","tenant",id,name,{category:unit.category,archive_id:archiveId});
        showToast(`📦 "${name}" archived successfully`);
      }

      // Move documents to archive using server-side copy
      if(archiveId){
        const safeUnitId=(id||"").replace(/[^a-zA-Z0-9._-]/g,"_");
        const docs=await listDocuments(safeUnitId,token);
        for(const doc of (Array.isArray(docs)?docs:[])){
          try{
            const srcPath=`${safeUnitId}/${doc.name}`;
            const dstPath=`archive/${archiveId}/${doc.name}`;
            const copyR=await fetch(`${SUPABASE_URL}/storage/v1/object/copy`,{
              method:"POST",
              headers:{...BASE_H,Authorization:`Bearer ${token}`},
              body:JSON.stringify({bucketId:"documents",sourceKey:srcPath,destinationKey:dstPath,destinationBucket:"documents"})
            });
            if(copyR.ok){
              await deleteDocument(srcPath,token);
            }
          }catch(e){}
        }
      }
    }
    catch(e){showToast("❌ Archive failed — "+(e?.message||"unknown error"));}
  }


  async function handleRestore(archiveId, isDeleted=false){
    try{
      if(isDeleted){
        // Restoring a soft-deleted tenant from the tenants table
        const r=await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(archiveId)}&org_id=eq.${orgId}`,{headers:authH(token)});
        const rows=await r.json();
        if(!rows||!rows[0]){showToast("❌ Record not found");return;}
        const row=rows[0];
        const orig=row.deleted_data?JSON.parse(row.deleted_data):row;
        const restored={...orig,deleted_at:null,deleted_data:null,archived:false};
        await dbUpsert(restored,token);
        // If this was a storage snapshot (generated ID), clean up the snapshot row
        if(row.id!==orig.id){
          await dbDelete(row.id,token);
        }
        const fresh=await dbGet(token,orgId);
        setData(fresh);
        auditLog(token,orgId,userEmail,"restore","tenant",orig.id,orig.tenant||orig.label||row.id,{from:"deleted"});
        showToast("✅ Restored — "+(orig.tenant||orig.label||row.id));
        return;
      }

      // Restoring from archived_tenants table
      const r=await fetch(`${SUPABASE_URL}/rest/v1/archived_tenants?id=eq.${archiveId}&org_id=eq.${orgId}`,{headers:authH(token)});
      const rows=await r.json();
      if(!rows||!rows[0]){showToast("❌ Archive record not found");return;}
      const record=rows[0];
      const tenantData=record.tenant_data;
      const unitId=record.original_unit_id;
      // Hard block — never allow restore if unit is currently occupied
      const unit=data.find(u=>u.id===unitId);
      const unitOccupied=unit&&(unit.tenant||["occupied","new","arrears","leaving"].includes(unit.status));
      if(unitOccupied){
        showToast(`⛔ Cannot restore — Unit ${unitId} is occupied by "${unit.tenant||"a tenant"}". Archive the current occupant first.`);
        return;
      }
      // If unit exists but is vacant, confirm before proceeding
      if(unit&&!unitOccupied){
        if(!window.confirm(
          `Restore ${tenantData?.tenant||unitId} to unit ${unitId}?\n\n` +
          `The unit is currently vacant. Their details and documents will be restored.`
        )) return;
      }
      // If unit doesn't exist at all (e.g. was deleted), warn
      if(!unit){
        if(!window.confirm(
          `Restore ${tenantData?.tenant||unitId}?\n\n` +
          `Unit ${unitId} no longer exists on the site plan and will be recreated. Continue?`
        )) return;
      }

      const restored={...tenantData,id:unitId,archived:false,deleted_at:null,deleted_data:null};
      await dbUpsert(restored,token);

      // Move documents using server-side copy (no browser download needed)
      const safeUnitId=(unitId||"").replace(/[^a-zA-Z0-9._-]/g,"_");
      const archiveDocs=await listDocuments("archive/"+archiveId,token);
      let docsRestored=0;
      for(const doc of (Array.isArray(archiveDocs)?archiveDocs:[])){
        const archivePath=`archive/${archiveId}/${doc.name}`;
        const newPath=`${safeUnitId}/${doc.name}`;
        try{
          // Use Supabase server-side copy API
          const copyR=await fetch(`${SUPABASE_URL}/storage/v1/object/copy`,{
            method:"POST",
            headers:{...BASE_H,Authorization:`Bearer ${token}`},
            body:JSON.stringify({bucketId:"documents",sourceKey:archivePath,destinationKey:newPath,destinationBucket:"documents"})
          });
          if(copyR.ok){
            // Update document_tags path
            await fetch(`${SUPABASE_URL}/rest/v1/document_tags?file_path=eq.${encodeURIComponent(archivePath)}`,{
              method:"PATCH",
              headers:{"Content-Type":"application/json",apikey:SUPABASE_KEY,Prefer:"return=minimal"},
              body:JSON.stringify({file_path:newPath,tenant_id:safeUnitId})
            });
            await deleteDocument(archivePath,token);
            docsRestored++;
          }
        }catch(e){}
      }
      auditLog(token,orgId,userEmail,"restore","tenant",unitId,tenantData?.tenant||tenantData?.label||unitId,{from:"archive",docs_restored:docsRestored});
      showToast(`✅ Restored — ${tenantData?.tenant||tenantData?.label||unitId} · ${docsRestored} doc${docsRestored!==1?"s":""} restored`);

      await archiveDelete(archiveId,token);
      const fresh=await dbGet(token,orgId);
      setData(fresh);
    }
    catch{showToast("❌ Restore failed");}
  }

  async function handlePermanentDelete(id, isDeleted=false){
    if(!window.confirm("Permanently delete this record? This cannot be undone.")) return;
    try{
      if(isDeleted){
        await dbDelete(id,token);
      } else {
        await archiveDelete(id,token);
      }
      showToast("🗑️ Permanently deleted");
    }
    catch{showToast("❌ Delete failed");}
  }
  function handleAdd(){
    setEditItem({id:"",label:null,tenant:"",email:"",phone:"",payment:"Monthly DD",rent:null,vat_rent:null,status:"occupied",category:"Storage",row_name:"",box_no:"",size:"XL(20ft)",section:"",review:"",notes:""});
    setIsNew(true);
  }
  async function handleImport(rows){
    if(!rows||rows.length===0){showToast("❌ No valid rows found in spreadsheet");return;}
    if(!orgId){showToast("❌ Not logged in to an organisation");return;}
    showToast(`⏳ Importing ${rows.length} records…`);
    try{
      // Convert Excel serial date numbers to YYYY-MM-DD strings
      function excelDateToISO(val) {
        if(!val) return null;
        const s = String(val).trim();
        if(!s) return null;
        // Already YYYY-MM-DD
        if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        // DD/MM/YYYY
        if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
          const [d,m,y] = s.split('/');
          return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
        // Excel serial number
        const num = Number(s);
        if(!isNaN(num) && num > 1000 && num < 100000) {
          const d = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
          return d.toISOString().slice(0, 10);
        }
        // Long-form English: "31st December 2027", "1st January 2026" etc.
        const months = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
        const longMatch = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})$/i);
        if(longMatch) {
          const day = String(longMatch[1]).padStart(2,'0');
          const month = months[longMatch[2].toLowerCase()];
          const year = longMatch[3];
          if(month) return `${year}-${String(month).padStart(2,'0')}-${day}`;
        }
        // Try JS Date parse as last resort
        try {
          const d = new Date(s);
          if(!isNaN(d.getTime())) return d.toISOString().slice(0,10);
        } catch {}
        return null;
      }

      const DATE_COLS = new Set(['review','move_in_date','move_out_date','deleted_at']);

      // Add org_id to every row, clean empty strings, remove columns that don't exist in Cerect, convert dates
      const VALID_COLS = new Set(['id','org_id','label','tenant','email','phone','payment','rent','vat_rent','status','category','row_name','box_no','size','review','notes','address','lock_deposit_paid','lock_deposit_amount','tenant_deposit','key_number','archived','deleted_at','deleted_data','sort_order','move_in_date','move_out_date']);
      const cleanRows = rows.map(row => {
        const clean = {...row, org_id: orgId, deleted_at: null, deleted_data: null, archived: false};
        Object.keys(clean).forEach(k => {
          if(!VALID_COLS.has(k)) { delete clean[k]; return; }
          if(clean[k]==="") { clean[k]=null; return; }
          if(DATE_COLS.has(k) && clean[k]) clean[k] = excelDateToISO(clean[k]);
        });
        return clean;
      });

      // Insert in batches of 50 to avoid request size limits
      const batchSize = 50;
      let imported = 0;
      for(let i=0; i<cleanRows.length; i+=batchSize){
        const batch = cleanRows.slice(i, i+batchSize);
        const r = await fetch(`${SUPABASE_URL}/rest/v1/tenants`, {
          method: "POST",
          headers: { ...authH(token), Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(batch)
        });
        if(!r.ok){
          const err = await r.text();
          throw new Error(`Batch ${Math.floor(i/batchSize)+1} failed (${r.status}): ${err}`);
        }
        imported += batch.length;
        showToast(`⏳ Imported ${imported} of ${cleanRows.length}…`);
      }

      // Reload data
      const fresh = await dbGet(token, orgId);
      setData(Array.isArray(fresh) ? fresh : []);

      // Rebuild areas
      const storageRows=[...new Set((Array.isArray(fresh)?fresh:[]).filter(d=>d.category==="Storage"&&d.row_name).map(d=>d.row_name))];
      for(let i=0;i<storageRows.length;i++){
        await areasUpsert(storageRows[i],"Storage",i,token,orgId);
      }
      const freshAreas=await areasGet(token,orgId);
      setAreas(freshAreas||[]);
      auditLog(token,orgId,userEmail,"import","tenant","bulk","Excel import",{record_count:imported});
      showToast(`✅ Imported ${imported} records successfully`);
    }catch(e){
      showToast("❌ Import failed: "+e.message);
      console.error("Import error:", e);
    }
  }
  async function handleAddUnit(unit){
    try{
      await dbUpsert(unit,token);
      setData(d=>[...d,unit]);
      // Add area to areas table if it doesn't exist
      if(unit.row_name){
        const exists=areas.some(a=>a.name===unit.row_name);
        if(!exists){
          await areasUpsert(unit.row_name,"Storage",areas.length,token,orgId);
          const fresh=await areasGet(token, orgId);
          setAreas(fresh||[]);
        }
      }
      showToast("✅ Unit added to site plan");
    }
    catch{showToast("❌ Could not add unit — check the ID is unique");}
  }

  async function handleRenameRow(oldName,newName){
    try{
      const units=data.filter(u=>u.row_name===oldName);
      for(const u of units){await dbUpsert({...u,row_name:newName},token);}
      setData(d=>d.map(u=>u.row_name===oldName?{...u,row_name:newName}:u));
      const area=areas.find(a=>a.name===oldName);
      if(area){
        await areasDelete(oldName,token,orgId);
        await areasUpsert(newName,"Storage",area.sort_order,token,orgId);
        const fresh=await areasGet(token, orgId);
        setAreas(fresh||[]);
      }
      showToast(`✅ Renamed "${oldName}" to "${newName}"`);
    }catch{showToast("❌ Rename failed");}
  }

  async function handleDeleteRow(rowName){
    try{
      const units=data.filter(u=>u.row_name===rowName);
      for(const u of units){await dbDelete(u.id,token);}
      setData(d=>d.filter(u=>u.row_name!==rowName));
      await areasDelete(rowName,token,orgId);
      const fresh=await areasGet(token, orgId);
      setAreas(fresh||[]);
      showToast(`🗑️ Deleted area "${rowName}" and all its units`);
    }catch{showToast("❌ Delete failed");}
  }

  function handleAddFromDashboard(category){
    setEditItem({id:"",label:"",tenant:"",email:"",phone:"",payment:"Monthly DD",rent:null,vat_rent:null,status:"occupied",category,row_name:null,box_no:null,size:null,section:null,review:"",notes:""});
    setIsNew(true);
  }

  if(!session) return(
    <><style>{CSS}</style><LoginPage onLogin={handleLogin}/></>
  );

  if(orgLoading) return(
    <><style>{CSS}</style>
    <div style={{minHeight:"100vh",background:"var(--mist)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center",color:"var(--sub)",fontSize:14}}>
        <ShieldLogo size={48}/>
        <div style={{fontFamily:"var(--fh)",fontSize:20,fontWeight:700,color:"var(--navy)",marginTop:12,marginBottom:8}}>cerect<span style={{color:"var(--gold)"}}>.</span></div>
        Loading your account…
      </div>
    </div></>
  );

  if(needsOnboarding) return(
    <><style>{CSS}</style>
    <OnboardingPage session={session} onComplete={o=>{setOrg(o);setNeedsOnboarding(false);showToast("✅ Welcome to Cerect!");}}/>
    </>
  );

  if(orgLocked) return(
    <><style>{CSS}</style>
    <div style={{minHeight:"100vh",background:"var(--mist)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#fff",borderRadius:16,padding:"48px 40px",maxWidth:480,width:"100%",textAlign:"center",boxShadow:"0 4px 32px rgba(0,0,0,0.08)"}}>
        <div style={{fontSize:48,marginBottom:16}}>{orgLocked==="archived"?"📦":"⏸"}</div>
        <div style={{fontFamily:"var(--fh)",fontSize:22,fontWeight:700,color:"var(--navy)",marginBottom:12}}>
          {orgLocked==="archived"?"Account Archived":"Account Suspended"}
        </div>
        <p style={{fontSize:14,color:"var(--sub)",lineHeight:1.6,marginBottom:24}}>
          {orgLocked==="archived"
            ?"Your Cerect account has been archived. Your data is safely preserved and can be restored at any time."
            :"Your Cerect account has been suspended. Please contact support to reactivate your account."
          }
        </p>
        <div style={{background:"var(--mist)",borderRadius:10,padding:"16px 20px",fontSize:13,color:"var(--sub)",marginBottom:24}}>
          Contact us at <strong>support@cerect.com</strong> to restore your account or download your data.
        </div>
        <button onClick={handleSignOut} style={{background:"var(--navy)",color:"#fff",border:"none",borderRadius:8,padding:"12px 24px",fontWeight:600,cursor:"pointer",fontSize:14}}>
          Sign Out
        </button>
      </div>
    </div>
    </>
  );

  const displayEmail=userEmail||"Admin";
  const initials=displayEmail.slice(0,2).toUpperCase();

  return(
    <>
      <style>{CSS}</style>
      {impersonating&&(
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,background:"#7B3FA0",color:"#fff",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 20px",fontSize:13,fontWeight:500}}>
          <span>👁 Viewing as <strong>{impersonating.org.name}</strong> — admin impersonation mode</span>
          <button onClick={handleStopImpersonating} style={{background:"#fff",color:"#7B3FA0",border:"none",borderRadius:6,padding:"4px 12px",fontWeight:700,cursor:"pointer",fontSize:12}}>✕ Exit — back to my account</button>
        </div>
      )}
      {offline&&(
        <div style={{position:"fixed",top:impersonating?40:0,left:0,right:0,zIndex:9998,background:"#C0392B",color:"#fff",textAlign:"center",padding:"10px 16px",fontSize:13,fontWeight:600}}>
          ⚠️ No internet connection — changes will not be saved until you reconnect
        </div>
      )}
      <div className="app" style={impersonating?{marginTop:40}:{}}>
        <div className={`sidebar-overlay${mobileNav?" active":""}`} onClick={()=>setMobileNav(false)}/>
        <aside className={`sidebar${mobileNav?" mobile-open":""}`}>
          <div className="logo-wrap">
            <div className="logo-row">
              <ShieldLogo size={36}/>
              <div className="logo-mark">cerect<span style={{color:"var(--gold)"}}>.</span></div>
            </div>
            <div className="logo-sub">{activeOrg?.name||"Management Platform"}</div>
          </div>
          <nav className="snav">
            {NAV.map((item,i)=>item.section
              ?<div key={i} className="ns">{item.section}</div>
              :<button key={item.id} className={`ni ${page===item.id?"active":""}`} onClick={()=>{setPage(item.id);setMobileNav(false);}}>
                <span className="nicon">{item.icon}</span>{item.label}
              </button>
            )}
            {isSuperAdmin&&!impersonating&&(
              <>
                <div className="ns">Platform</div>
                <button className={`ni ${page==="superadmin"?"active":""}`} onClick={()=>{setPage("superadmin");setMobileNav(false);}}>
                  <span className="nicon">⚙️</span>Super Admin
                </button>
              </>
            )}
          </nav>
          <div className="sfooter">
            {impersonating&&(
              <button onClick={handleStopImpersonating} style={{width:"100%",background:"#7B3FA0",color:"#fff",border:"none",borderRadius:8,padding:"10px 14px",fontWeight:600,fontSize:12,cursor:"pointer",marginBottom:8,textAlign:"left"}}>
                ✕ Exit impersonation
              </button>
            )}
            <div className="urow">
              <div className="uav">{initials}</div>
              <div>
                <div className="uname">{displayEmail}</div>
                <button className="signout-btn" onClick={handleSignOut}>Sign out</button>
              </div>
            </div>
          </div>
        </aside>
        <main className="main">
          <div className="topbar">
            <div className="fr" style={{gap:10,alignItems:"center"}}>
              <button className="hamburger" onClick={()=>setMobileNav(!mobileNav)} aria-label="Menu">☰</button>
              <div className="topbar-title">{TITLES[page]||"Cerect"}</div>
            </div>
            <div className="fr" style={{gap:16}}>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:12,color:"var(--sub)",fontWeight:500}}>Monthly Revenue</div>
                <div style={{fontSize:15,fontWeight:700,color:"var(--navy)"}}>£{data.filter(u=>u.rent&&["occupied","arrears","new"].includes(u.status)).reduce((a,b)=>a+(Number(b.rent)||0),0).toLocaleString()}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:12,color:"var(--sub)",fontWeight:500}}>Occupancy</div>
                <div style={{fontSize:15,fontWeight:700,color:"var(--navy)"}}>
                  {Math.round(data.filter(d=>d.category==="Storage").filter(u=>["occupied","arrears","new"].includes(u.status)).length/Math.max(data.filter(d=>d.category==="Storage").length,1)*100)}%
                </div>
              </div>
              <div style={{width:1,height:32,background:"#E4EAF2"}}/>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"var(--sub)"}}>Signed in as</div>
                <div style={{fontSize:12,fontWeight:600,color:"var(--navy)",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{displayEmail}</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={()=>setShowGlobalSearch(s=>!s)} title="Search everything (Ctrl+K)">🔍</button>
              <button className="btn btn-outline btn-sm" onClick={()=>setPage("users")} title="Users & Settings">⚙️</button>
            </div>
          </div>
          {showGlobalSearch&&(
            <div style={{background:"#fff",borderBottom:"1px solid #E4EAF2",padding:"10px 28px",display:"flex",gap:10,alignItems:"center"}}>
              <input autoFocus value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)}
                placeholder="Search tenants by name, unit, email, phone, notes…"
                style={{flex:1,fontFamily:"var(--fb)",fontSize:14,padding:"8px 14px",border:"1.5px solid var(--gold)",borderRadius:8,outline:"none"}}
                onKeyDown={e=>e.key==="Escape"&&(setShowGlobalSearch(false),setGlobalSearch(""))}/>
              <button className="btn btn-outline btn-sm" onClick={()=>{setShowGlobalSearch(false);setGlobalSearch("");}}>✕</button>
            </div>
          )}
          {showGlobalSearch&&globalSearch.trim()&&(()=>{
            const q=globalSearch.toLowerCase();
            const results=data.filter(t=>
              (t.tenant||"").toLowerCase().includes(q)||(t.id||"").toLowerCase().includes(q)||
              (t.email||"").toLowerCase().includes(q)||(t.phone||"").toLowerCase().includes(q)||
              (t.notes||"").toLowerCase().includes(q)||(t.label||"").toLowerCase().includes(q)||
              (t.address||"").toLowerCase().includes(q)
            ).slice(0,12);
            return(
              <div style={{background:"#fff",borderBottom:"1px solid #E4EAF2",padding:"0 28px 14px",maxHeight:360,overflowY:"auto"}}>
                {results.length===0
                  ?<div style={{fontSize:13,color:"var(--sub)",padding:"12px 0"}}>No results for "{globalSearch}"</div>
                  :results.map(t=>(
                    <div key={t.id} onClick={()=>{setEditItem(t);setIsNew(false);setShowGlobalSearch(false);setGlobalSearch("");}}
                      style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #F0F4FA",cursor:"pointer"}}>
                      <div style={{fontFamily:"var(--fh)",fontWeight:700,color:"var(--navy)",minWidth:60}}>{t.label||t.id}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600}}>{t.tenant||<span style={{color:"var(--sub)"}}>Vacant</span>}</div>
                        <div style={{fontSize:11,color:"var(--sub)"}}>{t.email||""} {t.phone?`· ${t.phone}`:""}</div>
                      </div>
                      <Pill s={t.status}/>
                      {t.rent&&<span style={{fontSize:13,fontWeight:600}}>£{t.rent}/mo</span>}
                    </div>
                  ))
                }
              </div>
            );
          })()}
          <div className="content">
            {loading
              ?<div className="loading">⏳ Loading your data…</div>
              :<>
                {page==="superadmin"&&isSuperAdmin&&<SuperAdminPage token={token} session={session} onImpersonate={handleImpersonate}/>}
                {page==="dashboard"&&<Dashboard data={data} enquiries={enquiries} tasks={tasks} onEdit={r=>{setEditItem(r);setIsNew(false);}} onAdd={handleAddFromDashboard} onDelete={handleDelete} onGoTo={p=>setPage(p)}/>}
                {page==="site"&&<SitePlan data={data} areas={areas} onEdit={r=>{setEditItem(r);setIsNew(false);}} onAdd={handleAddUnit} onDelete={handleDelete} onRenameRow={handleRenameRow} onDeleteRow={handleDeleteRow} showToast={showToast}
                  onSaveAreaOrder={async(names)=>{await areasUpdateOrder(names,token,orgId);const fresh=await areasGet(token,orgId);setAreas(fresh||[]);}}
                  onAddArea={async(name)=>{await areasUpsert(name,"Storage",areas.length,token,orgId);const fresh=await areasGet(token,orgId);setAreas(fresh||[]);showToast(`✅ Area "${name}" created`);}}
                  onSaveUnitOrder={async(updates)=>{
                    for(const u of updates){await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(u.id)}&org_id=eq.${orgId}`,{method:"PATCH",headers:{...authH(token),Prefer:"return=minimal"},body:JSON.stringify({sort_order:u.sort_order,row_name:u.row_name})});}
                    setData(d=>d.map(r=>{const upd=updates.find(u=>u.id===r.id);return upd?{...r,sort_order:upd.sort_order,row_name:upd.row_name}:r;}));
                    showToast("✅ Order saved");
                  }}/>}
                {page==="tenants"&&<Tenants data={data} onEdit={r=>{setEditItem(r);setIsNew(false);}} onAdd={handleAdd} onArchive={handleArchive}/>}
                {page==="tasks"&&<TasksPage token={token} showToast={showToast} data={data} orgId={orgId} onAudit={(a,et,ei,el,d)=>auditLog(token,orgId,userEmail,a,et,ei,el,d)}/>}
                {page==="calendar"&&<CalendarPage data={data} enquiries={enquiries} tasks={tasks}/>}
                {page==="payments"&&<Payments data={data} token={token} showToast={showToast} orgId={orgId} onAudit={(a,et,ei,el,d)=>auditLog(token,orgId,userEmail,a,et,ei,el,d)} onStatusUpdate={async(unitId,status)=>{
                  const unit=data.find(u=>u.id===unitId);if(!unit) return;
                  await dbUpsert({...unit,status,org_id:orgId},token);
                  setData(d=>d.map(u=>u.id===unitId?{...u,status}:u));
                }}/>}
                {page==="documents"&&<DocumentsPage data={data} token={token} showToast={showToast} orgId={orgId} onAudit={(a,et,ei,el,d)=>auditLog(token,orgId,userEmail,a,et,ei,el,d)}/>}
                {page==="tools"&&<DataTools data={data} onImport={handleImport} token={token} showToast={showToast} orgId={orgId}/>}
                {page==="enquiries"&&<EnquiriesPage token={token} data={data} orgId={orgId} onDataRefresh={loadData} showToast={showToast} onAudit={(a,et,ei,el,d)=>auditLog(token,orgId,userEmail,a,et,ei,el,d)}/>}
                {page==="archive"&&<ArchivePage token={token} orgId={orgId} onRestore={handleRestore} onPermanentDelete={handlePermanentDelete} showToast={showToast} onAudit={(a,et,ei,el,d)=>auditLog(token,orgId,userEmail,a,et,ei,el,d)}/>}
                {page==="users"&&<UsersPage token={token} currentUserEmail={displayEmail} orgId={orgId} onAudit={(a,et,ei,el,d)=>auditLog(token,orgId,userEmail,a,et,ei,el,d)}/>}
              </>
            }
          </div>
        </main>
      </div>
      {editItem&&(
        <EditModal item={editItem} isNew={isNew} onClose={()=>setEditItem(null)}
          onArchive={handleArchive} areas={areas.map(a=>a.name)} token={token} existingIds={data} orgId={orgId}
          onChangeUnitId={async(oldId,newId)=>{
            const unit=data.find(u=>u.id===oldId);if(!unit) return;
            const checkR=await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(newId)}&org_id=eq.${orgId}`,{headers:authH(token)});
            const checkData=await checkR.json();
            if(Array.isArray(checkData)&&checkData.length>0){showToast(`❌ Unit "${newId}" already exists`);return;}
            await dbUpsert({...unit,id:newId,org_id:orgId},token);
            await dbDelete(oldId,token,orgId);
            const safeOldId=oldId.replace(/[^a-zA-Z0-9._-]/g,"_");
            const safeNewId=newId.replace(/[^a-zA-Z0-9._-]/g,"_");
            const docs=await listDocuments(safeOldId,token);
            for(const doc of (Array.isArray(docs)?docs:[])){
              const srcPath=`${safeOldId}/${doc.name}`;const dstPath=`${safeNewId}/${doc.name}`;
              await fetch(`${SUPABASE_URL}/storage/v1/object/copy`,{method:"POST",headers:{...BASE_H,Authorization:`Bearer ${token}`},body:JSON.stringify({bucketId:"documents",sourceKey:srcPath,destinationKey:dstPath,destinationBucket:"documents"})});
              await deleteDocument(srcPath,token);
              await fetch(`${SUPABASE_URL}/rest/v1/document_tags?file_path=eq.${encodeURIComponent(srcPath)}`,{method:"PATCH",headers:{...authH(token),Prefer:"return=minimal"},body:JSON.stringify({file_path:dstPath,tenant_id:safeNewId})});
            }
            const fresh=await dbGet(token,orgId);setData(fresh);
            showToast(`✅ Unit ID changed from "${oldId}" to "${newId}"`);
          }}
          onSave={async(row)=>{
            const rowWithOrg={...row,org_id:orgId};
            if(isNew){await handleSaveNew(rowWithOrg);}else{await handleSave(rowWithOrg);}
            if(row.row_name&&!areas.some(a=>a.name===row.row_name)){
              await areasUpsert(row.row_name,"Storage",areas.length,token,orgId);
              const fresh=await areasGet(token,orgId);setAreas(fresh||[]);
            }
          }}
          onDelete={handleDelete} showToast={showToast} onAudit={(a,et,ei,el,d)=>auditLog(token,orgId,userEmail,a,et,ei,el,d)}/>
      )}
      {toast&&<div className="toast">{toast}</div>}
      {ConfirmModal}
    </>
  );
}
// ─── Document Viewer Modal ────────────────────────────────────────────────────
function DocViewer({url, name, onClose}) {
  const ext = (name||"").split(".").pop().toLowerCase();
  const isPdf = ext === "pdf";
  const isImg = ["jpg","jpeg","png","gif","webp","svg"].includes(ext);

  async function handleDownload() {
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  }

  return (
    <div className="modal-ov" onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{zIndex:2000}}>
      <div style={{
        background:"var(--white)",borderRadius:"var(--r)",
        width:"90vw",maxWidth:900,height:"88vh",
        display:"flex",flexDirection:"column",
        boxShadow:"0 20px 60px rgba(0,0,0,0.25)",overflow:"hidden"
      }}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"12px 18px",borderBottom:"1px solid #E2EAF2",flexShrink:0}}>
          <div style={{fontFamily:"var(--fh)",fontWeight:700,color:"var(--navy)",
            fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"60%"}}>
            {name}
          </div>
          <div style={{display:"flex",gap:8,flexShrink:0}}>
            <button className="btn btn-outline btn-sm" onClick={handleDownload}>⬇️ Download</button>
            <button className="btn btn-outline btn-sm" onClick={()=>window.open(url,"_blank")}>↗ Open in tab</button>
            <button className="btn btn-outline btn-sm" onClick={onClose}>✕ Close</button>
          </div>
        </div>
        {/* Viewer body */}
        <div style={{flex:1,overflow:"hidden",background:"#F4F7FA",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {isPdf && (
            <iframe
              src={url}
              title={name}
              style={{width:"100%",height:"100%",border:"none"}}
            />
          )}
          {isImg && (
            <img src={url} alt={name}
              style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",padding:16}} />
          )}
          {!isPdf && !isImg && (
            <div style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:48,marginBottom:16}}>{fileIcon(name)}</div>
              <div style={{fontSize:14,color:"var(--sub)",marginBottom:20}}>{name}</div>
              <p style={{fontSize:13,color:"var(--sub)",marginBottom:20}}>
                This file type cannot be previewed inline.
              </p>
              <button className="btn btn-primary" onClick={handleDownload}>⬇️ Download file</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

