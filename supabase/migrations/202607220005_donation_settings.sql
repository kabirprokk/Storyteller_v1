-- Donation QR configuration. Public visitors can read only the donation setting;
-- only active administrators can change it or upload donation artwork.
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
revoke all on public.site_settings from public, anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;

drop policy if exists "public_read_donation_setting" on public.site_settings;
create policy "public_read_donation_setting" on public.site_settings
for select to anon, authenticated using (key = 'donation_qr');

drop policy if exists "admins_read_site_settings" on public.site_settings;
create policy "admins_read_site_settings" on public.site_settings
for select to authenticated using (public.is_admin());
drop policy if exists "admins_insert_site_settings" on public.site_settings;
create policy "admins_insert_site_settings" on public.site_settings
for insert to authenticated with check (public.is_admin());
drop policy if exists "admins_update_site_settings" on public.site_settings;
create policy "admins_update_site_settings" on public.site_settings
for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins_delete_site_settings" on public.site_settings;
create policy "admins_delete_site_settings" on public.site_settings
for delete to authenticated using (public.is_admin());

insert into public.site_settings(key, value) values ('donation_qr', '{}'::jsonb)
on conflict (key) do nothing;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('donation-assets', 'donation-assets', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=3145728,
allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "public_read_donation_assets" on storage.objects;
create policy "public_read_donation_assets" on storage.objects
for select to anon, authenticated using (bucket_id = 'donation-assets');
drop policy if exists "admins_upload_donation_assets" on storage.objects;
create policy "admins_upload_donation_assets" on storage.objects
for insert to authenticated with check (bucket_id = 'donation-assets' and public.is_admin());
drop policy if exists "admins_update_donation_assets" on storage.objects;
create policy "admins_update_donation_assets" on storage.objects
for update to authenticated using (bucket_id = 'donation-assets' and public.is_admin())
with check (bucket_id = 'donation-assets' and public.is_admin());
drop policy if exists "admins_delete_donation_assets" on storage.objects;
create policy "admins_delete_donation_assets" on storage.objects
for delete to authenticated using (bucket_id = 'donation-assets' and public.is_admin());
