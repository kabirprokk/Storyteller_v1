-- Keep publication timestamps and public interactions consistent even if a client misbehaves.

update public.stories
set published_at = coalesce(published_at, created_at)
where status = 'published';

create or replace function public.normalize_story_publication() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());
  else
    new.published_at := null;
    new.is_featured := false;
  end if;
  return new;
end
$$;

drop trigger if exists normalize_story_publication on public.stories;
create trigger normalize_story_publication
before insert or update of status, published_at on public.stories
for each row execute function public.normalize_story_publication();

create or replace function public.is_active_user() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.profiles
    where id = (select auth.uid()) and not is_suspended
  )
$$;

grant execute on function public.is_active_user() to authenticated;

drop policy if exists "likes_owner_insert" on public.likes;
create policy "likes_owner_insert" on public.likes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_active_user()
  and exists(select 1 from public.stories where id = likes.story_id and status = 'published')
);

drop policy if exists "comments_owner_insert" on public.comments;
create policy "comments_owner_insert" on public.comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_active_user()
  and exists(select 1 from public.stories where id = comments.story_id and status = 'published')
);

drop policy if exists "follows_owner_write" on public.follows;
create policy "follows_owner_write" on public.follows to authenticated
using (follower_id = (select auth.uid()))
with check (follower_id = (select auth.uid()) and public.is_active_user());

drop policy if exists "reports_owner_insert" on public.reports;
create policy "reports_owner_insert" on public.reports for insert to authenticated
with check (reporter_id = (select auth.uid()) and public.is_active_user());
