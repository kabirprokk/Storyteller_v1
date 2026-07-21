-- Product hardening for reports and account libraries.
create policy "reporters_read_own_reports" on public.reports for select to authenticated using(reporter_id=(select auth.uid()));
create unique index if not exists one_story_report_per_user on public.reports(reporter_id,story_id) where story_id is not null and status in('open','reviewing');
create unique index if not exists one_comment_report_per_user on public.reports(reporter_id,comment_id) where comment_id is not null and status in('open','reviewing');
create index if not exists follows_following_idx on public.follows(following_id,created_at desc);
create index if not exists bookmarks_user_idx on public.bookmarks(user_id,created_at desc);
create index if not exists likes_story_idx on public.likes(story_id,created_at desc);
