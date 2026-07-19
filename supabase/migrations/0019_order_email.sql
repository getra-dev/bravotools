-- =====================================================
-- 0019 — Etapas 2D (SPEC 3.3 be AI): send an order to the
-- vendor by email. The Node side renders the PDF and does
-- the SMTP send (local inbucket now, Resend on promotion);
-- this RPC records the outbound_messages proof row and
-- moves the order to 'ordered'. Kept security-definer +
-- gated so the proof chain can't be forged from the client.
-- =====================================================

-- order documents (generated PDFs) — org-prefix RLS like the other buckets
insert into storage.buckets (id, name, public) values
  ('order-docs', 'order-docs', false)
on conflict (id) do nothing;

create policy order_docs_org_read on storage.objects for select
  using (bucket_id = 'order-docs' and is_org_member(((storage.foldername(name))[1])::uuid));
create policy order_docs_org_insert on storage.objects for insert
  with check (bucket_id = 'order-docs' and is_org_member(((storage.foldername(name))[1])::uuid));

-- outbound_messages proof chain: supply side reads its org's messages
create policy outbound_messages_select on outbound_messages
  for select using (is_supply(org_id));

create or replace function public.record_order_sent(args jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order uuid := (args->>'order_id')::uuid;
  ord record;
  msg_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into ord from orders where id = v_order;
  if ord.id is null then raise exception 'not_found'; end if;
  if not is_supply(ord.org_id) then raise exception 'not_allowed'; end if;
  if ord.status in ('delivered', 'cancelled') then raise exception 'order_closed'; end if;

  insert into outbound_messages
    (org_id, channel, to_address, subject, entity_type, entity_id,
     sent_by_type, sent_by, provider_message_id, status, status_updated_at,
     body_storage_path)
  values
    (ord.org_id, 'email', args->>'to_address', args->>'subject', 'order', v_order,
     'user', auth.uid(), nullif(args->>'provider_message_id', ''), 'sent', now(),
     nullif(args->>'body_storage_path', ''))
  returning id into msg_id;

  -- sending the PO advances requested/approved → ordered (idempotent-ish:
  -- re-sending an already-ordered order just logs another proof row)
  if ord.status in ('requested', 'approved') then
    update orders
    set status = 'ordered', confirmed_at = now(),
        vendor_id = coalesce(nullif(args->>'vendor_id', '')::uuid, vendor_id)
    where id = v_order;
  end if;

  insert into activity_log (org_id, entity_type, entity_id, actor_type, actor_id, action, payload)
  values (ord.org_id, 'order', v_order, 'user', auth.uid(), 'email_sent',
          jsonb_build_object('to', args->>'to_address', 'message_id', msg_id));
  return jsonb_build_object('message_id', msg_id);
end $$;
