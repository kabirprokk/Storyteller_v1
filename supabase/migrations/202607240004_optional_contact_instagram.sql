-- Make writer contact source optional and add an optional Instagram handle.

alter table public.profiles
  add column if not exists instagram_handle text;

alter table public.profiles drop constraint if exists profiles_instagram_handle_format;
alter table public.profiles add constraint profiles_instagram_handle_format check (
  instagram_handle is null or instagram_handle ~* '^[a-z0-9._]{1,30}$'
);

grant update(instagram_handle) on public.profiles to authenticated;

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
  writer_instagram text := nullif(regexp_replace(trim(coalesce(new.raw_user_meta_data ->> 'instagram_handle', '')), '^@', ''), '');
begin
  if requested_role not in ('reader', 'writer') then
    requested_role := 'reader';
  end if;

  if requested_role = 'writer' then
    if writer_email is null or writer_email !~* '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@gmail\.com$' then
      raise exception 'Writers must provide a valid Gmail address';
    end if;
    if writer_source is not null and char_length(writer_source) not between 3 and 300 then
      raise exception 'Contact source must be between 3 and 300 characters';
    end if;
    if writer_instagram is not null and writer_instagram !~* '^[a-z0-9._]{1,30}$' then
      raise exception 'Enter a valid Instagram handle';
    end if;
  end if;

  insert into public.profiles(
    id, username, display_name, role, contact_email, contact_source, instagram_handle
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', 'reader_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    requested_role,
    case when requested_role = 'writer' then writer_email end,
    case when requested_role = 'writer' then writer_source end,
    case when requested_role = 'writer' then writer_instagram end
  );
  return new;
end
$$;

drop function if exists public.become_writer(text, text);
create or replace function public.become_writer(writer_email text, writer_source text default '', writer_instagram text default '')
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_profile public.profiles;
  cleaned_email text := lower(trim(coalesce(writer_email, '')));
  cleaned_source text := nullif(trim(coalesce(writer_source, '')), '');
  cleaned_instagram text := nullif(regexp_replace(trim(coalesce(writer_instagram, '')), '^@', ''), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first';
  end if;

  if cleaned_email !~* '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@gmail\.com$' then
    raise exception 'Enter a valid Gmail address';
  end if;

  if cleaned_source is not null and char_length(cleaned_source) not between 3 and 300 then
    raise exception 'Contact source must be between 3 and 300 characters';
  end if;

  if cleaned_instagram is not null and cleaned_instagram !~* '^[a-z0-9._]{1,30}$' then
    raise exception 'Enter a valid Instagram handle';
  end if;

  select * into current_profile
  from public.profiles
  where id = (select auth.uid())
  for update;

  if current_profile.id is null then
    raise exception 'Profile not found';
  end if;

  if current_profile.is_suspended then
    raise exception 'Suspended accounts cannot become writers';
  end if;

  if current_profile.role = 'admin' then
    raise exception 'Administrator role cannot be changed here';
  end if;

  update public.profiles
  set role = 'writer',
      contact_email = cleaned_email,
      contact_source = cleaned_source,
      instagram_handle = cleaned_instagram
  where id = current_profile.id
  returning * into current_profile;

  return current_profile;
end
$$;

revoke all on function public.become_writer(text, text, text) from public, anon;
grant execute on function public.become_writer(text, text, text) to authenticated;

create or replace view public.public_profiles
with (security_barrier = true)
as
select username, display_name, bio, avatar_url, donation_qr_url, contact_email, contact_source, instagram_handle
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
  p.contact_source as author_contact_source,
  p.instagram_handle as author_instagram_handle
from public.stories s
join public.profiles p on p.id = s.author_id
left join public.categories c on c.id = s.category_id
where s.status = 'published';

grant select on public.public_profiles, public.public_story_feed to anon, authenticated;
