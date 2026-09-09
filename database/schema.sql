-- Pamana initial Supabase PostgreSQL schema
-- Run this in the Supabase SQL Editor after creating your Supabase project.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'contributor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_role_check
    check (role in ('contributor', 'admin'))
);

create table if not exists public.heritage_sites (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  short_description text,
  historical_background text,
  location text,
  historical_period text,
  source_reference text,
  main_photo text,
  status text not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint heritage_sites_status_check
    check (status in ('active', 'archived'))
);

create table if not exists public.stories (
  id bigint generated always as identity primary key,
  heritage_site_id bigint not null references public.heritage_sites(id) on delete cascade,
  contributor_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content text not null,
  source_reference text,
  suggested_classification text,
  classification text,
  contributor_display_name text,
  allow_public_name boolean not null default false,
  status text not null default 'submitted',
  review_notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint stories_status_check
    check (status in ('submitted', 'published', 'rejected')),

  constraint stories_suggested_classification_check
    check (
      suggested_classification is null
      or suggested_classification in (
        'Documented Historical Information',
        'Oral History',
        'Personal Recollection',
        'Community Legend'
      )
    ),

  constraint stories_classification_check
    check (
      classification is null
      or classification in (
        'Documented Historical Information',
        'Oral History',
        'Personal Recollection',
        'Community Legend'
      )
    )
);

create table if not exists public.media (
  id bigint generated always as identity primary key,
  heritage_site_id bigint references public.heritage_sites(id) on delete cascade,
  story_id bigint references public.stories(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  image_url text not null,
  caption text,
  created_at timestamptz not null default now(),

  constraint media_owner_check
    check (heritage_site_id is not null or story_id is not null)
);

create index if not exists heritage_sites_slug_idx on public.heritage_sites(slug);
create index if not exists heritage_sites_status_idx on public.heritage_sites(status);
create index if not exists stories_heritage_site_id_idx on public.stories(heritage_site_id);
create index if not exists stories_contributor_id_idx on public.stories(contributor_id);
create index if not exists stories_status_idx on public.stories(status);
create index if not exists media_heritage_site_id_idx on public.media(heritage_site_id);
create index if not exists media_story_id_idx on public.media(story_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_heritage_sites_updated_at on public.heritage_sites;
create trigger set_heritage_sites_updated_at
before update on public.heritage_sites
for each row
execute function public.set_updated_at();

drop trigger if exists set_stories_updated_at on public.stories;
create trigger set_stories_updated_at
before update on public.stories
for each row
execute function public.set_updated_at();

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Community Contributor'),
    'contributor'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.heritage_sites enable row level security;
alter table public.stories enable row level security;
alter table public.media enable row level security;

drop policy if exists "Visitors can view public profiles" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
using (
  auth.uid() = id
  or public.current_user_is_admin()
);

drop policy if exists "Users can create own contributor profile" on public.profiles;
create policy "Users can create own contributor profile"
on public.profiles
for insert
with check (
  auth.uid() = id
  and role = 'contributor'
);

-- Contributors do not edit profiles in the MVP. Do not add a self-referencing
-- profiles UPDATE policy: querying public.profiles from its own RLS policy can
-- recurse. Administrators retain update access through the policy below.
drop policy if exists "Users can update own non-role profile fields" on public.profiles;

drop policy if exists "Admins can manage profiles" on public.profiles;
create policy "Admins can manage profiles"
on public.profiles
for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Visitors can view active heritage sites" on public.heritage_sites;
create policy "Visitors can view active heritage sites"
on public.heritage_sites
for select
using (status = 'active' or public.current_user_is_admin());

drop policy if exists "Admins can manage heritage sites" on public.heritage_sites;
create policy "Admins can manage heritage sites"
on public.heritage_sites
for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Visitors can view published stories" on public.stories;
create policy "Visitors can view published stories"
on public.stories
for select
using (
  status = 'published'
  or contributor_id = auth.uid()
  or public.current_user_is_admin()
);

drop policy if exists "Contributors can submit own stories" on public.stories;
create policy "Contributors can submit own stories"
on public.stories
for insert
with check (
  contributor_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'contributor'
  )
  and status = 'submitted'
  and classification is null
  and review_notes is null
  and reviewed_by is null
  and reviewed_at is null
  and published_at is null
);

drop policy if exists "Contributors can update own submitted stories" on public.stories;
create policy "Contributors can update own submitted stories"
on public.stories
for update
using (
  contributor_id = auth.uid()
  and status = 'submitted'
)
with check (
  contributor_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'contributor'
  )
  and status = 'submitted'
  and classification is null
  and review_notes is null
  and reviewed_by is null
  and reviewed_at is null
  and published_at is null
);

drop policy if exists "Admins can manage stories" on public.stories;
create policy "Admins can manage stories"
on public.stories
for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Visitors can view public media" on public.media;
create policy "Visitors can view public media"
on public.media
for select
using (
  exists (
    select 1
    from public.heritage_sites
    where heritage_sites.id = media.heritage_site_id
      and media.story_id is null
      and heritage_sites.status = 'active'
  )
  or exists (
    select 1
    from public.stories
    where stories.id = media.story_id
      and stories.status = 'published'
  )
  or uploaded_by = auth.uid()
  or public.current_user_is_admin()
);

drop policy if exists "Authenticated users can upload related media" on public.media;
drop policy if exists "Contributors can upload media for own stories" on public.media;
create policy "Contributors can upload media for own stories"
on public.media
for insert
with check (
  uploaded_by = auth.uid()
  and heritage_site_id is null
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'contributor'
  )
  and story_id is not null
  and exists (
    select 1
    from public.stories
    where stories.id = media.story_id
      and stories.contributor_id = auth.uid()
      and stories.status = 'submitted'
  )
);

drop policy if exists "Admins can upload heritage site media" on public.media;
create policy "Admins can upload heritage site media"
on public.media
for insert
with check (
  uploaded_by = auth.uid()
  and public.current_user_is_admin()
);

drop policy if exists "Admins can manage media" on public.media;
create policy "Admins can manage media"
on public.media
for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

-- Optional starter data.
-- Replace the UUID values with real IDs from auth.users after creating test accounts.

/*
insert into public.profiles (id, display_name, role)
values
  ('00000000-0000-0000-0000-000000000001', 'Admin User', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'Community Contributor', 'contributor');

insert into public.heritage_sites (
  slug,
  name,
  short_description,
  historical_background,
  location,
  historical_period,
  source_reference,
  main_photo,
  created_by
)
values (
  'old-town-plaza',
  'Old Town Plaza',
  'A historic public plaza used for civic gatherings.',
  'The plaza has served as a central gathering place for local residents across generations.',
  'Sample Municipality',
  'Spanish Colonial Period',
  'Local heritage office archive',
  'https://example.com/images/old-town-plaza.jpg',
  '00000000-0000-0000-0000-000000000001'
);

insert into public.stories (
  heritage_site_id,
  contributor_id,
  title,
  content,
  source_reference,
  suggested_classification,
  contributor_display_name,
  allow_public_name
)
values (
  1,
  '00000000-0000-0000-0000-000000000002',
  'Memories of the Plaza',
  'My grandparents remembered the plaza as a place for community announcements and celebrations.',
  'Family interview',
  'Oral History',
  'Community Contributor',
  true
);

insert into public.media (
  heritage_site_id,
  story_id,
  uploaded_by,
  image_url,
  caption
)
values (
  1,
  null,
  '00000000-0000-0000-0000-000000000001',
  'https://example.com/images/old-town-plaza.jpg',
  'Sample photo of Old Town Plaza'
);
*/
