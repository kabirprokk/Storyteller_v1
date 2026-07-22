-- Admin-only account directory. Sensitive authentication metadata is returned
-- only after a database-level administrator check.

create or replace function public.admin_user_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'bio', p.bio,
        'avatar_url', p.avatar_url,
        'role', p.role,
        'is_suspended', p.is_suspended,
        'created_at', p.created_at,
        'updated_at', p.updated_at,
        'email', u.email,
        'email_confirmed_at', u.email_confirmed_at,
        'last_sign_in_at', u.last_sign_in_at,
        'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb),
        'story_count', (select count(*) from public.stories s where s.author_id = p.id),
        'published_count', (select count(*) from public.stories s where s.author_id = p.id and s.status = 'published'),
        'draft_count', (select count(*) from public.stories s where s.author_id = p.id and s.status = 'draft'),
        'comment_count', (select count(*) from public.comments c where c.user_id = p.id),
        'like_count', (select count(*) from public.likes l where l.user_id = p.id),
        'bookmark_count', (select count(*) from public.bookmarks b where b.user_id = p.id),
        'follower_count', (select count(*) from public.follows f where f.following_id = p.id),
        'following_count', (select count(*) from public.follows f where f.follower_id = p.id),
        'report_count', (select count(*) from public.reports r where r.reporter_id = p.id)
      )
      order by p.created_at desc
    )
    from public.profiles p
    left join auth.users u on u.id = p.id
  ), '[]'::jsonb);
end
$$;

revoke all on function public.admin_user_directory() from public, anon;
grant execute on function public.admin_user_directory() to authenticated;