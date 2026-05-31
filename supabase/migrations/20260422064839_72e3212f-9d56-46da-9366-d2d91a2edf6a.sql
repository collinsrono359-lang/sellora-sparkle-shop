-- Private bucket for KYC ID uploads
insert into storage.buckets (id, name, public)
values ('kyc', 'kyc', false)
on conflict (id) do nothing;

-- Storage policies: users manage their own folder; admins/moderators can read all
create policy "Users upload own KYC"
on storage.objects for insert
with check (bucket_id = 'kyc' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users read own KYC"
on storage.objects for select
using (
  bucket_id = 'kyc'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'moderator')
  )
);

create policy "Users delete own KYC"
on storage.objects for delete
using (bucket_id = 'kyc' and auth.uid()::text = (storage.foldername(name))[1]);

-- KYC submissions table
create type public.kyc_status as enum ('pending', 'approved', 'rejected');

create table public.kyc_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  id_front_path text not null,
  id_back_path text,
  selfie_path text,
  document_type text not null default 'national_id',
  status public.kyc_status not null default 'pending',
  notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kyc_submissions enable row level security;

create policy "Users see own KYC submissions"
on public.kyc_submissions for select
using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'moderator'));

create policy "Users insert own KYC submissions"
on public.kyc_submissions for insert
with check (auth.uid() = user_id);

create policy "Users update own pending KYC"
on public.kyc_submissions for update
using (auth.uid() = user_id and status = 'pending');

create policy "Admins update any KYC"
on public.kyc_submissions for update
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'moderator'));

create trigger update_kyc_submissions_updated_at
before update on public.kyc_submissions
for each row execute function public.update_updated_at_column();
