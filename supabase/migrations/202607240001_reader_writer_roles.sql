-- Public account roles: readers can read, writers can create and manage only their own work.
-- Administrator behavior remains governed by the existing admin migrations.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  alter column role set default 'reader',
  add constraint profiles_role_check check (role in ('reader', 'writer', 'admin')),
  add column if not exists contact_email text,
  add column if not exists contact_source text;

alter table public.profiles drop constraint if exists profiles_contact_email_format;
alter table public.profiles add constraint profiles_contact_email_format check (
  contact_email is null or contact_email ~* '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@gmail\.com$'
);
alter table public.profiles drop constraint if exists profiles_contact_source_length;
alter table public.profiles add constraint profiles_contact_source_length check (
  contact_source is null or char_length(contact_source) between 3 and 300
);

create or replace function public.is_writer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'writer' and not is_suspended
  )
$$;
revoke all on function public.is_writer() from public, anon;
grant execute on function public.is_writer() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'reader');
  writer_email text := nullif(trim(new.raw_user_meta_data ->> 'contact_email'), '');
  writer_source text := nullif(trim(new.raw_user_meta_data ->> 'contact_source'), '');
begin
  if requested_role not in ('reader', 'writer') then
    requested_role := 'reader';
  end if;

  if requested_role = 'writer' then
    if writer_email is null or writer_email !~* '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@gmail\.com$' then
      raise exception 'Writers must provide a valid Gmail address';
    end if;
    if writer_source is null or char_length(writer_source) not between 3 and 300 then
      raise exception 'Writers must provide a contact source';
    end if;
  end if;

  insert into public.profiles(
    id, username, display_name, role, contact_email, contact_source
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', 'reader_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    requested_role,
    case when requested_role = 'writer' then writer_email end,
    case when requested_role = 'writer' then writer_source end
  );
  return new;
end
$$;

grant update(contact_email, contact_source) on public.profiles to authenticated;

drop policy if exists "stories_owner_insert" on public.stories;
create policy "stories_owner_insert" on public.stories for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_writer());
drop policy if exists "stories_owner_update" on public.stories;
create policy "stories_owner_update" on public.stories for update to authenticated
  using (author_id = (select auth.uid()) and public.is_writer())
  with check (author_id = (select auth.uid()) and public.is_writer());
drop policy if exists "stories_owner_delete" on public.stories;
create policy "stories_owner_delete" on public.stories for delete to authenticated
  using (author_id = (select auth.uid()) and public.is_writer());

drop policy if exists "likes_owner_insert" on public.likes;
create policy "likes_owner_insert" on public.likes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_writer());
drop policy if exists "likes_owner_delete" on public.likes;
create policy "likes_owner_delete" on public.likes for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_writer());
drop policy if exists "bookmarks_owner_all" on public.bookmarks;
create policy "bookmarks_owner_all" on public.bookmarks to authenticated
  using (user_id = (select auth.uid()) and public.is_writer())
  with check (user_id = (select auth.uid()) and public.is_writer());
drop policy if exists "comments_owner_insert" on public.comments;
create policy "comments_owner_insert" on public.comments for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_writer());
drop policy if exists "comments_owner_update" on public.comments;
create policy "comments_owner_update" on public.comments for update to authenticated
  using (user_id = (select auth.uid()) and public.is_writer())
  with check (user_id = (select auth.uid()) and public.is_writer());
drop policy if exists "comments_owner_delete" on public.comments;
create policy "comments_owner_delete" on public.comments for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_writer());
drop policy if exists "follows_owner_write" on public.follows;
create policy "follows_owner_write" on public.follows to authenticated
  using (follower_id = (select auth.uid()) and public.is_writer())
  with check (follower_id = (select auth.uid()) and public.is_writer());
drop policy if exists "reports_owner_insert" on public.reports;
create policy "reports_owner_insert" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and public.is_writer());

drop policy if exists "writers_upload_own_donation_qr" on storage.objects;
create policy "writers_upload_own_donation_qr" on storage.objects for insert to authenticated
with check (
  bucket_id = 'donation-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.is_writer()
);

create or replace view public.public_profiles
with (security_barrier = true)
as
select username, display_name, bio, avatar_url, donation_qr_url, contact_email, contact_source
from public.profiles
where role in ('writer', 'admin');

create or replace view public.public_story_feed
with (security_barrier = true)
as
select
  s.id, s.slug, s.title, s.subtitle, s.content_html, s.cover_url, s.tags,
  s.status, s.is_featured, s.reading_minutes, s.view_count, s.published_at,
  s.created_at, s.category_id,
  p.username as author_username,
  p.display_name as author_name,
  p.avatar_url as author_avatar_url,
  c.name as category_name,
  c.slug as category_slug,
  (s.author_id = auth.uid()) as is_own,
  (select count(*) from public.likes l where l.story_id = s.id) as like_count,
  p.donation_qr_url as author_donation_qr_url,
  p.contact_email as author_contact_email,
  p.contact_source as author_contact_source
from public.stories s
join public.profiles p on p.id = s.author_id
left join public.categories c on c.id = s.category_id
where s.status = 'published';

grant select on public.public_profiles, public.public_story_feed to anon, authenticated;
