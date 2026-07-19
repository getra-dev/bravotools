-- =====================================================
-- 0014 — SPEC 2.11: act archiving as a DISPLAY state.
-- Append-only stays sacred: nothing is deleted, archived
-- acts just leave the default lists (PDFs stay in storage).
-- =====================================================

alter table handover_acts add column archived_at timestamptz;

create index idx_acts_active on handover_acts (org_id, created_at desc)
  where archived_at is null;

create or replace function public.archive_acts(target_org uuid, up_to date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
  archived integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select role into caller_role
  from memberships where org_id = target_org and user_id = auth.uid();
  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'not_allowed';
  end if;
  if up_to is null then raise exception 'date_required'; end if;

  update handover_acts
  set archived_at = now()
  where org_id = target_org
    and status = 'signed'
    and archived_at is null
    and created_at::date <= up_to;
  get diagnostics archived = row_count;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (target_org, 'organization', target_org, 'user', auth.uid(), 'acts_archived',
          jsonb_build_object('up_to', up_to, 'count', archived));

  return jsonb_build_object('archived', archived);
end $$;
