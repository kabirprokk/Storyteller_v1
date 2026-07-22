-- Security hardening: public data minimization and abuse-resistant view metrics.

-- The old RPC could be called directly and repeatedly by anyone.
revoke all on function public.increment_story_view(uuid) from public, anon, authenticated;

create table if not exists public.story_view_windows (
  story_id uuid not null references public.stories(id) on delete cascade,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (story_id, visitor_hash, window_start)
);
alter table public.story_view_windows enable row level security;
revoke all on public.story_view_windows from public, anon, authenticated;

create or replace function public.record_story_view(target uuid, fingerprint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if fingerprint is null or fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid view fingerprint';
  end if;

  insert into public.story_view_windows(story_id, visitor_hash, window_start)
  select target, fingerprint, date_trunc('hour', now())
  where exists (
    select 1 from public.stories where id = target and status = 'published'
  )
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then
    update public.stories set view_count = view_count + 1
    where id = target and status = 'published';
    return true;
  end if;
  return false;
end;
$$;
revoke all on function public.record_story_view(uuid, text) from public, anon, authenticated;
grant execute on function public.record_story_view(uuid, text) to service_role;

-- Profiles are private by default. Public consumers use the safe views below.
drop policy if exists "profiles_public_read" on public.profiles;
drop policy if exists "profiles_owner_read" on public.profiles;
drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_owner_read" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles_admin_read" on public.profiles for select to authenticated
  using (public.is_admin());

-- Published stories are exposed through a deliberately flattened view that omits author UUIDs.
drop policy if exists "stories_public_read" on public.stories;
drop policy if exists "stories_owner_read" on public.stories;
drop policy if exists "stories_admin_read" on public.stories;
create policy "stories_owner_read" on public.stories for select to authenticated
  using (author_id = (select auth.uid()));
create policy "stories_admin_read" on public.stories for select to authenticated
  using (public.is_admin());

drop policy if exists "comments_public_read" on public.comments;
drop policy if exists "comments_owner_read" on public.comments;
drop policy if exists "comments_admin_read" on public.comments;
create policy "comments_owner_read" on public.comments for select to authenticated
  using (user_id = (select auth.uid()));
create policy "comments_admin_read" on public.comments for select to authenticated
  using (public.is_admin());

drop policy if exists "likes_public_read" on public.likes;
drop policy if exists "likes_owner_read" on public.likes;
create policy "likes_owner_read" on public.likes for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "follows_public_read" on public.follows;
drop policy if exists "follows_owner_read" on public.follows;
create policy "follows_owner_read" on public.follows for select to authenticated
  using (follower_id = (select auth.uid()));

revoke select on public.profiles, public.stories, public.comments, public.likes, public.follows from anon, authenticated;
grant select on public.profiles, public.stories, public.comments, public.likes, public.follows to authenticated;

create or replace view public.public_profiles
with (security_barrier = true)
as
select username, display_name, bio, avatar_url
from public.profiles;

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
  (select count(*) from public.likes l where l.story_id = s.id) as like_count
from public.stories s
join public.profiles p on p.id = s.author_id
left join public.categories c on c.id = s.category_id
where s.status = 'published';

create or replace view public.public_comments
with (security_barrier = true)
as
select
  c.id, c.story_id, c.body, c.created_at,
  p.username as author_username,
  p.display_name as author_name,
  p.avatar_url as author_avatar_url
from public.comments c
join public.profiles p on p.id = c.user_id
join public.stories s on s.id = c.story_id
where not c.is_hidden and s.status = 'published';

create or replace view public.my_notifications
with (security_barrier = true)
as
select
  n.id, n.story_id, n.kind, n.message, n.read_at, n.created_at,
  p.display_name as actor_name,
  p.avatar_url as actor_avatar_url
from public.notifications n
left join public.profiles p on p.id = n.actor_id
where n.user_id = auth.uid();

revoke all on public.public_profiles, public.public_story_feed, public.public_comments, public.my_notifications from public;
grant select on public.public_profiles, public.public_story_feed, public.public_comments to anon, authenticated;
grant select on public.my_notifications to authenticated;

create or replace function public.toggle_follow(target_username text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  follower uuid := auth.uid();
  target uuid;
begin
  if follower is null then raise exception 'Sign in first'; end if;
  select id into target from public.profiles where username = target_username;
  if target is null then raise exception 'Writer not found'; end if;
  if target = follower then raise exception 'You cannot follow yourself'; end if;

  if exists(select 1 from public.follows where follower_id = follower and following_id = target) then
    delete from public.follows where follower_id = follower and following_id = target;
    return false;
  end if;
  insert into public.follows(follower_id, following_id) values(follower, target);
  return true;
end;
$$;
revoke all on function public.toggle_follow(text) from public, anon;
grant execute on function public.toggle_follow(text) to authenticated;

