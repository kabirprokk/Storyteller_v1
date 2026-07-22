-- Defense in depth: administrative and authenticated helper RPCs must not be
-- discoverable or executable through the anonymous PostgREST role.

revoke all on function public.admin_set_user_state(uuid, text, boolean) from public, anon;
grant execute on function public.admin_set_user_state(uuid, text, boolean) to authenticated;

revoke all on function public.admin_dashboard_metrics() from public, anon;
grant execute on function public.admin_dashboard_metrics() to authenticated;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Some production projects predate the publication-integrity migration. Harden
-- optional helpers only when their exact signatures exist, so this migration is
-- safe for both upgraded and freshly provisioned databases.
do $$
begin
  if to_regprocedure('public.is_active_user()') is not null then
    execute 'revoke all on function public.is_active_user() from public, anon';
    execute 'grant execute on function public.is_active_user() to authenticated';
  end if;
end
$$;

-- Trigger functions run as part of their triggers and need no browser role grants.
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.set_updated_at()',
    'public.handle_new_user()',
    'public.create_social_notification()',
    'public.normalize_story_publication()'
  ]
  loop
    if to_regprocedure(signature) is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated',
        signature
      );
    end if;
  end loop;
end
$$;

-- Reassert the hardened public contract. Anonymous visitors use minimized views;
-- sensitive base tables remain inaccessible and continue to be protected by RLS.
revoke select on public.profiles, public.stories, public.comments, public.likes, public.follows from anon;
grant select on public.public_profiles, public.public_story_feed, public.public_comments to anon, authenticated;