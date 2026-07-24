-- Readers retain normal reading and community tools.
-- Only authoring stories and writer donation uploads are Writer-only.

drop policy if exists "likes_owner_insert" on public.likes;
create policy "likes_owner_insert" on public.likes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_active_user()
  and exists(select 1 from public.stories where id = likes.story_id and status = 'published')
);

drop policy if exists "likes_owner_delete" on public.likes;
create policy "likes_owner_delete" on public.likes for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "bookmarks_owner_all" on public.bookmarks;
create policy "bookmarks_owner_all" on public.bookmarks to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and public.is_active_user()
  and exists(select 1 from public.stories where id = bookmarks.story_id and status = 'published')
);

drop policy if exists "comments_owner_insert" on public.comments;
create policy "comments_owner_insert" on public.comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_active_user()
  and exists(select 1 from public.stories where id = comments.story_id and status = 'published')
);

drop policy if exists "comments_owner_update" on public.comments;
create policy "comments_owner_update" on public.comments for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and public.is_active_user());

drop policy if exists "comments_owner_delete" on public.comments;
create policy "comments_owner_delete" on public.comments for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "follows_owner_write" on public.follows;
create policy "follows_owner_write" on public.follows to authenticated
using (follower_id = (select auth.uid()))
with check (follower_id = (select auth.uid()) and public.is_active_user());

drop policy if exists "reports_owner_insert" on public.reports;
create policy "reports_owner_insert" on public.reports for insert to authenticated
with check (reporter_id = (select auth.uid()) and public.is_active_user());
