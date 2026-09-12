-- Dedicated authoring bank. No changes to legacy MCQ/MEQ items or exam delivery.
create table public.meq_cases (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null default auth.uid() references auth.users(id),
 title text not null check(length(trim(title)) > 0),
 academic_year integer not null check(academic_year between 2400 and 3000),
 exam_year integer check(exam_year between 2400 and 3000),
 document jsonb not null check(jsonb_typeof(document)='object' and document->>'version'='1' and jsonb_typeof(document->'stages')='array'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.meq_cases enable row level security;
revoke all on public.meq_cases from anon, authenticated;
grant select,insert,update on public.meq_cases to authenticated;
create policy meq_read on public.meq_cases for select to authenticated using (
 auth_is_super_admin() or exam_has_role('committee'::exam_item_role) or exam_has_role('registrar'::exam_item_role) or author_id=(select auth.uid())
);
create policy meq_create on public.meq_cases for insert to authenticated with check (
 author_id=(select auth.uid()) and (auth_is_super_admin() or exam_has_role('committee'::exam_item_role) or exam_has_role('item_writer'::exam_item_role))
);
create policy meq_edit on public.meq_cases for update to authenticated using (
 auth_is_super_admin() or exam_has_role('committee'::exam_item_role) or (author_id=(select auth.uid()) and exam_has_role('item_writer'::exam_item_role))
) with check (
 auth_is_super_admin() or exam_has_role('committee'::exam_item_role) or (author_id=(select auth.uid()) and exam_has_role('item_writer'::exam_item_role))
);
create index meq_cases_author_idx on public.meq_cases(author_id);
create index meq_cases_year_idx on public.meq_cases(academic_year);
