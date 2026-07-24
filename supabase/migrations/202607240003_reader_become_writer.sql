-- Let an authenticated Reader safely upgrade their own account to Writer.
-- Admin roles are still assigned privately and cannot be requested through this RPC.

create or replace function public.become_writer(writer_email text, writer_source text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_profile public.profiles;
  cleaned_email text := lower(trim(coalesce(writer_email, '')));
  cleaned_source text := trim(coalesce(writer_source, ''));
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first';
  end if;

  if cleaned_email !~* '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@gmail\.com$' then
    raise exception 'Enter a valid Gmail address';
  end if;

  if char_length(cleaned_source) not between 3 and 300 then
    raise exception 'Add a contact source between 3 and 300 characters';
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
      contact_source = cleaned_source
  where id = current_profile.id
  returning * into current_profile;

  return current_profile;
end
$$;

revoke all on function public.become_writer(text, text) from public, anon;
grant execute on function public.become_writer(text, text) to authenticated;
