# Cerect — Storage Management Platform

> v0.1 — Foundation build

## Overview

Cerect is a multi-tenant SaaS platform for self-storage and mixed-use property operators. Built with React, Supabase, and Vercel.

## Tech Stack

| Layer | Service |
|---|---|
| Frontend | React (Create React App) |
| Hosting | Vercel |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + MFA (TOTP) |
| Email | Resend API |
| E-signatures | DocuSeal (self-hosted, coming soon) |
| Billing | Stripe (coming soon) |

## Project Structure

```
/
├── src/
│   ├── App.jsx          # Main application
│   └── index.js         # Entry point
├── api/
│   ├── admin.js         # User management (Supabase Admin API)
│   ├── send-invite.js   # Invitation emails via Resend
│   └── send-reset.js    # Password reset emails via Resend
├── public/
│   └── index.html
├── package.json
└── vercel.json
```

## Environment Variables

Set these in Vercel project settings (never commit them to the repo):

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
RESEND_API_KEY=your-resend-key
```

The `SUPABASE_URL` and `SUPABASE_ANON_KEY` are also referenced in `src/App.jsx` — replace the placeholder values there after setting up your Supabase project.

## Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Run the SQL below in the Supabase SQL editor to create the core tables
3. Disable new user signups in Supabase Auth settings (users are invited only)
4. Enable MFA in Supabase Auth settings

### Core SQL

```sql
-- Organisations (each paying customer)
create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  plan text default 'trial',
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_ends_at timestamptz,
  created_at timestamptz default now()
);

-- Organisation users (links Supabase auth users to orgs)
create table org_users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  user_id uuid not null,
  role text default 'admin',
  invited_at timestamptz default now(),
  joined_at timestamptz
);

-- Areas
create table areas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  name text not null,
  category text,
  sort_order int default 0
);

-- Tenants
create table tenants (
  id text not null,
  org_id uuid references organisations(id) on delete cascade,
  label text,
  tenant text,
  email text,
  phone text,
  payment text,
  rent numeric,
  vat_rent numeric,
  status text default 'available',
  category text,
  row_name text,
  box_no text,
  size text,
  review date,
  notes text,
  address text,
  lock_deposit_paid boolean default false,
  lock_deposit_amount numeric,
  tenant_deposit numeric,
  key_number text,
  archived boolean default false,
  deleted_at timestamptz,
  deleted_data jsonb,
  sort_order int default 0,
  move_in_date date,
  move_out_date date,
  primary key (org_id, id)
);

-- Payment records
create table payment_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  tenant_id text not null,
  period_month text not null,
  amount numeric,
  method text,
  notes text,
  paid_at timestamptz,
  created_at timestamptz default now(),
  unique(org_id, tenant_id, period_month)
);

-- Enquiries (CRM)
create table enquiries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  name text,
  email text,
  phone text,
  category text,
  size_needed text,
  notes text,
  status text default 'waiting',
  enquiry_date date,
  follow_up_date date,
  earmarked_unit text,
  updated_at timestamptz
);

-- Document tags
create table document_tags (
  id bigserial primary key,
  org_id uuid references organisations(id) on delete cascade,
  file_path text,
  tenant_id text,
  tag text,
  original_name text
);

-- Archived tenants
create table archived_tenants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  original_unit_id text,
  tenant_data jsonb,
  archived_at timestamptz default now()
);

-- Agreements (e-signatures)
create table agreements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  tenant_id text,
  template_id uuid,
  docuseal_id text,
  status text default 'pending',
  sent_at timestamptz,
  signed_at timestamptz,
  document_path text
);

-- Agreement templates
create table agreement_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  name text,
  docuseal_template_id text,
  is_platform_default boolean default false,
  created_at timestamptz default now()
);

-- Disable RLS on all tables (simple approach for v0.1)
alter table organisations disable row level security;
alter table org_users disable row level security;
alter table areas disable row level security;
alter table tenants disable row level security;
alter table payment_records disable row level security;
alter table enquiries disable row level security;
alter table document_tags disable row level security;
alter table archived_tenants disable row level security;
alter table agreements disable row level security;
alter table agreement_templates disable row level security;

-- Grant access
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
```

## Vercel Deployment

1. Connect your GitHub repo to Vercel
2. Set environment variables in Vercel project settings
3. Vercel auto-deploys on every push to `main`
4. Connect your `cerect.com` domain in Vercel project settings

## Deployment Checklist

- [ ] Supabase project created
- [ ] SQL run in Supabase SQL editor
- [ ] Supabase URL and anon key updated in `src/App.jsx`
- [ ] Environment variables set in Vercel
- [ ] `cerect.com` domain connected in Vercel
- [ ] `cerect.com` domain verified in Resend
- [ ] New user signups disabled in Supabase Auth
- [ ] First admin user created manually in Supabase Auth

## Version History

- v0.1 — Foundation: login, MFA, app shell, navigation, dashboard skeleton
