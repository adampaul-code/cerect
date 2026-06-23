-- Run in Supabase SQL editor if bookings table doesn't exist yet

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  unit_id text,
  category text default 'Storage',
  customer_name text not null,
  customer_email text,
  customer_phone text,
  start_date date not null,
  end_date date,
  status text default 'pending',
  deposit_amount numeric,
  deposit_paid boolean default false,
  monthly_rent numeric,
  payment_method text,
  stripe_session_id text,
  notes text,
  enquiry_id uuid references enquiries(id),
  source text default 'admin',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table bookings disable row level security;
grant select, insert, update, delete on table bookings to anon, authenticated;