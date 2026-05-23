@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

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

.brand-wordmark span { color: var(--gold); }

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
  transition: background .12s, color .12s;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  font-family: var(--fb);
  position: relative;
}

.nav-item:hover { background: rgba(255,255,255,.07); color: #fff; }
.nav-item.active { background: rgba(255,255,255,.12); color: #fff; font-weight: 500; }
.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  width: 3px;
  height: 36px;
  background: var(--gold);
  border-radius: 0 2px 2px 0;
}

.nav-icon { width: 18px; height: 18px; opacity: .7; flex-shrink: 0; }
.nav-item.active .nav-icon, .nav-item:hover .nav-icon { opacity: 1; }

.sidebar-bottom {
  padding: 14px 18px;
  border-top: 1px solid rgba(255,255,255,.1);
}

.user-chip { display: flex; align-items: center; gap: 10px; }

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

.main { margin-left: 232px; flex: 1; min-height: 100vh; display: flex; flex-direction: column; }

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

.topbar-title { font-family: var(--fh); font-size: 17px; font-weight: 600; color: var(--text); flex: 1; }
.topbar-org { font-size: 13px; color: var(--sub); background: var(--mist); padding: 4px 10px; border-radius: 99px; }

.hamburger { display: none; background: none; border: none; cursor: pointer; padding: 4px; color: var(--text); }
@media (max-width: 900px) { .hamburger { display: flex; } }

.page { padding: 28px; flex: 1; }

.card { background: #fff; border-radius: var(--r2); border: 1px solid var(--border); padding: 20px 24px; }
.card-title { font-family: var(--fh); font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.card-sub { font-size: 13px; color: var(--sub); margin-bottom: 16px; }

.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 24px; }
.kpi-card { background: #fff; border-radius: var(--r2); border: 1px solid var(--border); padding: 18px 22px; }
.kpi-label { font-size: 12px; color: var(--sub); font-weight: 500; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
.kpi-value { font-family: var(--fh); font-size: 28px; font-weight: 700; color: var(--text); line-height: 1; margin-bottom: 4px; }
.kpi-meta { font-size: 12px; color: var(--sub); }

.coming-soon { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 320px; gap: 12px; color: var(--sub); }
.coming-soon-icon { width: 48px; height: 48px; opacity: .25; }
.coming-soon-title { font-family: var(--fh); font-size: 18px; font-weight: 600; color: var(--sub); }
.coming-soon-sub { font-size: 14px; color: var(--sub); opacity: .7; }

.backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 90; }
.backdrop.open { display: block; }

.toast-wrap { position: fixed; bottom: 24px; right: 24px; z-index: 999; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
.toast { background: var(--text); color: #fff; font-size: 13px; padding: 10px 16px; border-radius: var(--r); box-shadow: var(--shl); animation: slideUp .2s ease; max-width: 320px; }
.toast.success { background: var(--success); }
.toast.error { background: var(--danger); }

@keyframes slideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.data-table th { text-align: left; padding: 10px 14px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--sub); border-bottom: 1px solid var(--border); white-space: nowrap; }
.data-table td { padding: 11px 14px; border-bottom: 1px solid var(--border); color: var(--text); vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.data-table tbody tr { transition: background .1s; cursor: pointer; }
.data-table tbody tr:hover { background: var(--mist); }

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

.btn-primary { background: var(--navy); color: #fff; font-family: var(--fb); font-size: 15px; font-weight: 500; padding: 11px 22px; border: none; border-radius: var(--r); cursor: pointer; transition: background .15s; }
.btn-primary:hover { background: var(--navy2); }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.btn-secondary { background: var(--mist); color: var(--text); font-family: var(--fb); font-size: 15px; font-weight: 500; padding: 11px 22px; border: 1px solid var(--border); border-radius: var(--r); cursor: pointer; transition: background .15s; }
.btn-secondary:hover { background: var(--mist2); }

.form-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
.form-label { font-size: 12px; font-weight: 500; color: var(--sub); text-transform: uppercase; letter-spacing: .6px; }
.form-input { font-family: var(--fb); font-size: 15px; padding: 11px 14px; border: 1.5px solid var(--mist2); border-radius: var(--r); outline: none; transition: border-color .15s; color: var(--text); background: #fff; }
.form-input:focus { border-color: var(--navy2); }
.form-hint { font-size: 12px; color: var(--sub); margin-top: -10px; }
