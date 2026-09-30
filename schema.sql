-- =========================================================================
-- SmartMed Database Schema with Row Level Security (RLS)
-- Suitable for Supabase PostgreSQL
-- =========================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles Table (Requirement #8: id, full_name, email, mobile_number, created_at)
create table if not exists public.profiles (
    id uuid references auth.users(id) on delete cascade primary key,
    full_name text not null,
    email text not null,
    mobile_number text,
    created_at timestamptz default now() not null
);

-- 2. Medicines Table
create table if not exists public.medicines (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    dosage text not null,
    dosage_unit text not null default 'mg',
    schedule_time text not null,
    frequency text not null default 'Once a day',
    meal_instruction text default 'After Meal',
    slot integer default 1,
    start_date date default current_date,
    end_date date,
    notes text,
    created_at timestamptz default now() not null
);

-- 2. Medicine Logs Table
create table if not exists public.medicine_logs (
    id uuid default uuid_generate_v4() primary key,
    medicine_id uuid references public.medicines(id) on delete cascade not null,
    user_id uuid references auth.users(id) on delete cascade not null,
    scheduled_time text not null,
    taken_at text,
    status text not null check (status in ('upcoming', 'pending', 'taken', 'missed')),
    created_at timestamptz default now() not null
);

-- =========================================================================
-- Enable Row Level Security (RLS)
-- Each user can strictly only access, insert, update, and delete their own data
-- =========================================================================

alter table public.profiles enable row level security;
alter table public.medicines enable row level security;
alter table public.medicine_logs enable row level security;

-- Policies for public.profiles
create policy "Users can view their own profile" 
    on public.profiles for select 
    using (auth.uid() = id);

create policy "Users can insert their own profile" 
    on public.profiles for insert 
    with check (auth.uid() = id);

create policy "Users can update their own profile" 
    on public.profiles for update 
    using (auth.uid() = id);

create policy "Users can delete their own profile" 
    on public.profiles for delete 
    using (auth.uid() = id);

-- Policies for public.medicines
create policy "Users can view their own medicines" 
    on public.medicines for select 
    using (auth.uid() = user_id);

create policy "Users can insert their own medicines" 
    on public.medicines for insert 
    with check (auth.uid() = user_id);

create policy "Users can update their own medicines" 
    on public.medicines for update 
    using (auth.uid() = user_id);

create policy "Users can delete their own medicines" 
    on public.medicines for delete 
    using (auth.uid() = user_id);

-- Policies for public.medicine_logs
create policy "Users can view their own medicine logs" 
    on public.medicine_logs for select 
    using (auth.uid() = user_id);

create policy "Users can insert their own medicine logs" 
    on public.medicine_logs for insert 
    with check (auth.uid() = user_id);

create policy "Users can update their own medicine logs" 
    on public.medicine_logs for update 
    using (auth.uid() = user_id);

create policy "Users can delete their own medicine logs" 
    on public.medicine_logs for delete 
    using (auth.uid() = user_id);

-- Enable Realtime for all tables
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.medicines;
alter publication supabase_realtime add table public.medicine_logs;
