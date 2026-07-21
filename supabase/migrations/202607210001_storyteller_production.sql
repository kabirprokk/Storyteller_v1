-- STORYTELLER production schema. Safe to run once in the Supabase SQL editor.
create extension if not exists pgcrypto;

create type public.story_status as enum ('draft','published','archived');
create type public.notification_kind as enum ('like','comment','follow','publish');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_url text,
  role text not null default 'writer' check (role in ('writer','admin')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.categories (
  id bigint generated always as identity primary key,
  slug text unique not null, name text unique not null, description text not null default ''
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  category_id bigint references public.categories(id) on delete set null,
  slug text unique not null,
  title text not null check (char_length(title) between 3 and 160),
  subtitle text not null default '' check (char_length(subtitle) <= 300),
  content_html text not null default '',
  cover_url text,
  tags text[] not null default '{}',
  status public.story_status not null default 'draft',
  is_featured boolean not null default false,
  reading_minutes smallint not null default 1 check (reading_minutes between 1 and 180),
  view_count bigint not null default 0 check (view_count >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.likes (user_id uuid references public.profiles(id) on delete cascade,story_id uuid references public.stories(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,story_id));
create table public.bookmarks (user_id uuid references public.profiles(id) on delete cascade,story_id uuid references public.stories(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,story_id));
create table public.comments (id uuid primary key default gen_random_uuid(),story_id uuid not null references public.stories(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,body text not null check(char_length(body) between 1 and 2000),is_hidden boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.follows (follower_id uuid references public.profiles(id) on delete cascade,following_id uuid references public.profiles(id) on delete cascade,created_at timestamptz not null default now(),primary key(follower_id,following_id),check(follower_id<>following_id));
create table public.reading_history (user_id uuid references public.profiles(id) on delete cascade,story_id uuid references public.stories(id) on delete cascade,progress smallint not null default 0 check(progress between 0 and 100),last_read_at timestamptz not null default now(),primary key(user_id,story_id));
create table public.notifications (id bigint generated always as identity primary key,user_id uuid not null references public.profiles(id) on delete cascade,actor_id uuid references public.profiles(id) on delete set null,story_id uuid references public.stories(id) on delete cascade,kind public.notification_kind not null,message text not null default '',read_at timestamptz,created_at timestamptz not null default now());
create table public.reports (id uuid primary key default gen_random_uuid(),reporter_id uuid not null references public.profiles(id) on delete cascade,story_id uuid references public.stories(id) on delete cascade,comment_id uuid references public.comments(id) on delete cascade,reason text not null check(char_length(reason) between 5 and 500),status text not null default 'open' check(status in('open','reviewing','resolved','dismissed')),created_at timestamptz not null default now(),check((story_id is not null)::int+(comment_id is not null)::int=1));

create index stories_feed_idx on public.stories(status,published_at desc);
create index stories_author_idx on public.stories(author_id,status,updated_at desc);
create index stories_category_idx on public.stories(category_id,published_at desc);
create index stories_tags_idx on public.stories using gin(tags);
create index comments_story_idx on public.comments(story_id,created_at desc);
create index notifications_user_idx on public.notifications(user_id,read_at,created_at desc);
create index history_user_idx on public.reading_history(user_id,last_read_at desc);

create function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger stories_updated before update on public.stories for each row execute function public.set_updated_at();
create trigger comments_updated before update on public.comments for each row execute function public.set_updated_at();

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,username,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'username','writer_'||substr(new.id::text,1,8)),coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1)));return new;end$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.increment_story_view(target uuid) returns void language sql security definer set search_path='' as $$update public.stories set view_count=view_count+1 where id=target and status='published'$$;
grant execute on function public.increment_story_view(uuid) to anon,authenticated;

insert into public.categories(slug,name) values ('fiction','Fiction'),('essays','Essays'),('poetry','Poetry'),('culture','Culture'),('travel','Travel'),('nature','Nature'),('personal-growth','Personal Growth'),('science','Science'),('history','History') on conflict do nothing;

alter table public.profiles enable row level security; alter table public.categories enable row level security; alter table public.stories enable row level security; alter table public.likes enable row level security; alter table public.bookmarks enable row level security; alter table public.comments enable row level security; alter table public.follows enable row level security; alter table public.reading_history enable row level security; alter table public.notifications enable row level security; alter table public.reports enable row level security;

create policy "profiles_public_read" on public.profiles for select to anon,authenticated using(true);
create policy "profiles_owner_update" on public.profiles for update to authenticated using((select auth.uid())=id) with check((select auth.uid())=id);
create policy "categories_public_read" on public.categories for select to anon,authenticated using(true);
create policy "stories_public_read" on public.stories for select to anon,authenticated using(status='published' or author_id=(select auth.uid()));
create policy "stories_owner_insert" on public.stories for insert to authenticated with check(author_id=(select auth.uid()));
create policy "stories_owner_update" on public.stories for update to authenticated using(author_id=(select auth.uid())) with check(author_id=(select auth.uid()));
create policy "stories_owner_delete" on public.stories for delete to authenticated using(author_id=(select auth.uid()));
create policy "likes_public_read" on public.likes for select to anon,authenticated using(true);
create policy "likes_owner_insert" on public.likes for insert to authenticated with check(user_id=(select auth.uid()));
create policy "likes_owner_delete" on public.likes for delete to authenticated using(user_id=(select auth.uid()));
create policy "bookmarks_owner_all" on public.bookmarks to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "comments_public_read" on public.comments for select to anon,authenticated using(not is_hidden);
create policy "comments_owner_insert" on public.comments for insert to authenticated with check(user_id=(select auth.uid()));
create policy "comments_owner_update" on public.comments for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "comments_owner_delete" on public.comments for delete to authenticated using(user_id=(select auth.uid()));
create policy "follows_public_read" on public.follows for select to anon,authenticated using(true);
create policy "follows_owner_write" on public.follows to authenticated using(follower_id=(select auth.uid())) with check(follower_id=(select auth.uid()));
create policy "history_owner_all" on public.reading_history to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "notifications_owner_read" on public.notifications for select to authenticated using(user_id=(select auth.uid()));
create policy "notifications_owner_update" on public.notifications for update to authenticated using(user_id=(select auth.uid()));
create policy "reports_owner_insert" on public.reports for insert to authenticated with check(reporter_id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('story-covers','story-covers',true,5242880,array['image/jpeg','image/png','image/webp','image/avif']),('avatars','avatars',true,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy "public_media_read" on storage.objects for select to anon,authenticated using(bucket_id in('story-covers','avatars'));
create policy "authenticated_media_upload" on storage.objects for insert to authenticated with check(bucket_id in('story-covers','avatars') and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "owner_media_update" on storage.objects for update to authenticated using(owner_id=(select auth.uid()::text)) with check(owner_id=(select auth.uid()::text));
create policy "owner_media_delete" on storage.objects for delete to authenticated using(owner_id=(select auth.uid()::text));

grant select on public.profiles,public.categories,public.stories,public.likes,public.comments,public.follows to anon;
grant select on all tables in schema public to authenticated;
grant update(username,display_name,bio,avatar_url) on public.profiles to authenticated;
grant insert,update,delete on public.stories,public.likes,public.bookmarks,public.comments,public.follows,public.reading_history,public.notifications,public.reports to authenticated;
grant usage,select on all sequences in schema public to authenticated;

create function public.create_social_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; actor uuid; target_story uuid; event_kind public.notification_kind; copy text;
begin
  if tg_table_name='likes' then select author_id into recipient from public.stories where id=new.story_id; actor:=new.user_id; target_story:=new.story_id; event_kind:='like'; copy:='Someone appreciated your story';
  elsif tg_table_name='comments' then select author_id into recipient from public.stories where id=new.story_id; actor:=new.user_id; target_story:=new.story_id; event_kind:='comment'; copy:='Someone commented on your story';
  else recipient:=new.following_id; actor:=new.follower_id; event_kind:='follow'; copy:='You have a new follower'; end if;
  if recipient<>actor then insert into public.notifications(user_id,actor_id,story_id,kind,message) values(recipient,actor,target_story,event_kind,copy); end if;
  return new;
end$$;
create trigger notify_like after insert on public.likes for each row execute function public.create_social_notification();
create trigger notify_comment after insert on public.comments for each row execute function public.create_social_notification();
create trigger notify_follow after insert on public.follows for each row execute function public.create_social_notification();
