-- Admin authorization and moderation controls.
alter table public.profiles add column if not exists is_suspended boolean not null default false;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and not is_suspended)
$$;
grant execute on function public.is_admin() to authenticated;

create policy "admins_manage_profiles" on public.profiles for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admins_delete_profiles" on public.profiles for delete to authenticated using(public.is_admin());
create policy "admins_manage_stories" on public.stories for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admins_manage_comments" on public.comments for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admins_read_reports" on public.reports for select to authenticated using(public.is_admin());
create policy "admins_manage_reports" on public.reports for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admins_read_notifications" on public.notifications for select to authenticated using(public.is_admin());

grant delete on public.profiles to authenticated;

create or replace function public.admin_set_user_state(target uuid,new_role text default null,suspended boolean default null) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  if target=(select auth.uid()) and (new_role is distinct from 'admin' or suspended=true) then raise exception 'Administrators cannot lock themselves out'; end if;
  update public.profiles set role=coalesce(new_role,role),is_suspended=coalesce(suspended,is_suspended) where id=target;
end$$;
grant execute on function public.admin_set_user_state(uuid,text,boolean) to authenticated;

create or replace function public.admin_delete_user(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  if target=(select auth.uid()) then raise exception 'Administrators cannot delete themselves'; end if;
  delete from auth.users where id=target;
end$$;
revoke all on function public.admin_delete_user(uuid) from public,anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Suspended accounts cannot create or change content.
drop policy if exists "stories_owner_insert" on public.stories;
create policy "stories_owner_insert" on public.stories for insert to authenticated with check(author_id=(select auth.uid()) and not exists(select 1 from public.profiles where id=(select auth.uid()) and is_suspended));
drop policy if exists "stories_owner_update" on public.stories;
create policy "stories_owner_update" on public.stories for update to authenticated using(author_id=(select auth.uid())) with check(author_id=(select auth.uid()) and not exists(select 1 from public.profiles where id=(select auth.uid()) and is_suspended));

create or replace function public.admin_dashboard_metrics() returns jsonb language sql stable security definer set search_path='' as $$
  select case when public.is_admin() then jsonb_build_object(
    'users',(select count(*) from public.profiles),
    'stories',(select count(*) from public.stories),
    'published',(select count(*) from public.stories where status='published'),
    'comments',(select count(*) from public.comments),
    'open_reports',(select count(*) from public.reports where status='open'),
    'views',(select coalesce(sum(view_count),0) from public.stories)
  ) else '{}'::jsonb end
$$;
grant execute on function public.admin_dashboard_metrics() to authenticated;
