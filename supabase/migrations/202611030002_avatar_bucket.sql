-- Public avatars bucket. Reads via public URL, writes only through the
-- gateway's service-role client (no storage policies for anon/authenticated).
begin;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

commit;
