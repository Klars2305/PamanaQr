-- Pamana Supabase Storage setup
-- Run this after database/schema.sql.

-- alter table storage.objects enable row level security;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'heritage-images',
  'heritage-images',
  false,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read approved heritage images" on storage.objects;
create policy "Public can read approved heritage images"
on storage.objects
for select
using (
  bucket_id = 'heritage-images'
  and (
    exists (
      select 1
      from public.heritage_sites
      where heritage_sites.status = 'active'
        and heritage_sites.main_photo = storage.objects.name
    )
    or exists (
      select 1
      from public.media
      join public.heritage_sites
        on heritage_sites.id = media.heritage_site_id
      where media.image_url = storage.objects.name
        and media.story_id is null
        and heritage_sites.status = 'active'
    )
    or exists (
      select 1
      from public.media
      join public.stories
        on stories.id = media.story_id
      where media.image_url = storage.objects.name
        and stories.status = 'published'
    )
    or public.current_user_is_admin()
    or owner_id = auth.uid()::text
  )
);

drop policy if exists "Admins can upload heritage images" on storage.objects;
create policy "Admins can upload heritage images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'heritage-images'
  and public.current_user_is_admin()
  and (storage.foldername(name))[1] = 'heritage'
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp')
);

drop policy if exists "Contributors can upload own story images" on storage.objects;
create policy "Contributors can upload own story images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'heritage-images'
  and (storage.foldername(name))[1] = 'stories'
  and (storage.foldername(name))[2] ~ '^[0-9]+$'
  and (storage.foldername(name))[3] = auth.uid()::text
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp')
  and exists (
    select 1
    from public.stories
    where stories.id = ((storage.foldername(name))[2])::bigint
      and stories.contributor_id = auth.uid()
      and stories.status = 'submitted'
  )
);

drop policy if exists "Admins can update heritage images" on storage.objects;
create policy "Admins can update heritage images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'heritage-images'
  and public.current_user_is_admin()
)
with check (
  bucket_id = 'heritage-images'
  and public.current_user_is_admin()
);

drop policy if exists "Admins can delete heritage images" on storage.objects;
create policy "Admins can delete heritage images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'heritage-images'
  and public.current_user_is_admin()
);

drop policy if exists "Contributors can delete own submitted story images" on storage.objects;
create policy "Contributors can delete own submitted story images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'heritage-images'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = 'stories'
  and (storage.foldername(name))[2] ~ '^[0-9]+$'
  and exists (
    select 1
    from public.stories
    where stories.id = ((storage.foldername(name))[2])::bigint
      and stories.contributor_id = auth.uid()
      and stories.status = 'submitted'
  )
);
