-- Private, owner-only exercise images and GIFs. Files never live inside the user's
-- tracker JSON, and every object must be stored under <auth.uid()>/filename.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-media',
  'exercise-media',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "exercise_media_select_own" on storage.objects;
create policy "exercise_media_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'exercise-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "exercise_media_insert_own" on storage.objects;
create policy "exercise_media_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'exercise-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "exercise_media_update_own" on storage.objects;
create policy "exercise_media_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'exercise-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'exercise-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "exercise_media_delete_own" on storage.objects;
create policy "exercise_media_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'exercise-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
