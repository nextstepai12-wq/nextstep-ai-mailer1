-- ============================================================
-- NextStep AI — مركز المراسلات | Supabase schema
-- شغّل هذا الملف كاملاً مرة واحدة من: SQL Editor
-- إعداد: م. أحمد وسام الحايك — مؤسس NextStep
-- ============================================================

-- 1) المشرفون المسموح لهم باستخدام مركز المراسلات
create table if not exists public.admins (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- دالة التحقق من المشرف (تعمل بصلاحيات مرتفعة لتفادي التكرار الذاتي في RLS)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 2) جهات الاتصال (المستلمون)
create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  email      text not null unique check (email = lower(email)),
  source     text not null default 'mailer',
  subscribed boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists contacts_subscribed_idx on public.contacts (subscribed, created_at desc);

-- 3) الحملات البريدية
create table if not exists public.mail_campaigns (
  id         uuid primary key default gen_random_uuid(),
  subject    text not null,
  body_html  text not null default '',
  total      int  not null default 0,
  sent       int  not null default 0,
  failed     int  not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

-- 4) سجل كل رسالة (تكتبه دالة الإرسال)
create table if not exists public.mail_log (
  id          bigint generated always as identity primary key,
  campaign_id uuid references public.mail_campaigns(id) on delete set null,
  email       text not null,
  name        text,
  status      text not null check (status in ('sent','failed')),
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists mail_log_campaign_idx on public.mail_log (campaign_id);
create index if not exists mail_log_day_idx on public.mail_log (created_at, status);

-- 5) الأمان: تفعيل RLS ومنع أي وصول لغير المشرفين
alter table public.admins         enable row level security;
alter table public.contacts       enable row level security;
alter table public.mail_campaigns enable row level security;
alter table public.mail_log       enable row level security;

drop policy if exists "admins read self"   on public.admins;
drop policy if exists "admins all"         on public.contacts;
drop policy if exists "admins all"         on public.mail_campaigns;
drop policy if exists "admins read log"    on public.mail_log;

create policy "admins read self" on public.admins
  for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "admins all" on public.contacts
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins all" on public.mail_campaigns
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins read log" on public.mail_log
  for select to authenticated
  using (public.is_admin());
-- ملاحظة: الكتابة في mail_log تتم من دالة الإرسال بمفتاح service_role فقط.

-- ============================================================
-- 6) أضف نفسك كمشرف (غيّر البريد إلى بريدك الذي ستسجل به الدخول)
-- ============================================================
-- insert into public.admins (email) values ('your-email@example.com');

-- ============================================================
-- 7) اختياري: السماح للمشرف بقراءة جدول مستخدمين آخر لاستيراده
-- (غيّر اسم الجدول، وتأكد من أسماء الأعمدة التي ستكتبها في الواجهة)
-- ============================================================
-- alter table public.team_applications enable row level security;
-- create policy "admins read team_applications" on public.team_applications
--   for select to authenticated using (public.is_admin());
