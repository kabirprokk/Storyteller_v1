-- Defense in depth: administrative and authenticated helper RPCs must not be
-- discoverable or executable through the anonymous PostgREST role.

revoke all on function public.admin_set_user_state(uuid, text, boolean) from public, anon;
grant execute on function public.admin_set_user_state(uuid, text, boolean) to authenticated;

revoke all on function public.admin_dashboard_metrics() from public, anon;
grant execute on function public.admin_dashboard_metrics() to authenticated;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

-- Trigger functions run as part of their triggers and need no browser role grants.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.create_social_notification() from public, anon, authenticated;
revoke all on function public.normalize_story_publication() from public, anon, authenticated;

-- Reassert the hardened public contract. Anonymous visitors use minimized views;
-- sensitive base tables remain inaccessible and continue to be protected by RLS.
revoke select on public.profiles, public.stories, public.comments, public.likes, public.follows from anon;
grant select on public.public_profiles, public.public_story_feed, public.public_comments to anon, authenticated;