import { NextResponse, type NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { renderActPdf, type SignatureStrokes } from '@/lib/acts/pdf';

async function loadSignature(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  path: string | null,
): Promise<SignatureStrokes | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from('signatures').download(path);
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as SignatureStrokes;
  } catch {
    return null;
  }
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { data: act } = await supabase
    .from('handover_acts')
    .select(
      `id, org_id, act_number, created_at, pdf_storage_path,
       giver_signature_path, receiver_signature_path,
       giver:profiles!handover_acts_giver_id_fkey(full_name),
       receiver:profiles!handover_acts_receiver_id_fkey(full_name),
       external_receiver:external_persons!handover_acts_external_receiver_id_fkey(full_name),
       movement:tool_movements!handover_acts_movement_id_fkey(
         id, action, performed_at, gps_latitude, gps_longitude,
         tool:tools(name, qr_code, serial_number),
         org:organizations(name))`,
    )
    .eq('id', id)
    .maybeSingle();
  if (!act || !act.movement) return new NextResponse(null, { status: 404 });

  // cached copy from a previous render
  if (act.pdf_storage_path) {
    const { data: cached } = await supabase.storage.from('acts').download(act.pdf_storage_path);
    if (cached) {
      return new NextResponse(await cached.arrayBuffer(), {
        headers: { 'Content-Type': 'application/pdf' },
      });
    }
  }

  const [{ data: checklist }, { count: photoCount }, giverSig, receiverSig, t, tTools] =
    await Promise.all([
      supabase
        .from('movement_components')
        .select('included, condition_note, component:tool_components(name)')
        .eq('movement_id', act.movement.id),
      supabase
        .from('tool_photos')
        .select('id', { count: 'exact', head: true })
        .eq('movement_id', act.movement.id),
      loadSignature(supabase, act.giver_signature_path),
      loadSignature(supabase, act.receiver_signature_path),
      getTranslations('actPdf'),
      getTranslations('tools.detail.actions'),
    ]);

  const movement = act.movement;
  const gps =
    movement.gps_latitude !== null && movement.gps_longitude !== null
      ? `${movement.gps_latitude}, ${movement.gps_longitude}`
      : '—';

  const buffer = await renderActPdf({
    labels: {
      title: t('title'),
      tool: t('tool'),
      serial: t('serial'),
      qr: t('qr'),
      giver: t('giver'),
      receiver: t('receiver'),
      components: t('components'),
      included: t('included'),
      missing: t('missing'),
      note: t('note'),
      photos: t('photos', { count: photoCount ?? 0 }),
      gps: t('gps'),
      signatureGiver: t('signatureGiver'),
      signatureReceiver: t('signatureReceiver'),
      generated: t('generated'),
      action: t('action'),
    },
    orgName: movement.org?.name ?? '',
    actNumber: act.act_number,
    date: movement.performed_at.slice(0, 16).replace('T', ' '),
    actionLabel: tTools(movement.action as Parameters<typeof tTools>[0]),
    toolName: movement.tool?.name ?? '',
    toolQr: movement.tool?.qr_code ?? '',
    toolSerial: movement.tool?.serial_number ?? '—',
    giverName: act.giver?.full_name ?? '—',
    receiverName: act.receiver?.full_name ?? act.external_receiver?.full_name ?? '—',
    components: (checklist ?? []).map((c) => ({
      name: c.component?.name ?? '',
      included: c.included,
      note: c.condition_note ?? '',
    })),
    photoCount: photoCount ?? 0,
    gps,
    giverSignature: giverSig,
    receiverSignature: receiverSig,
  });

  // store for next time; ignore failures (render still streams)
  const pdfPath = `${act.org_id}/acts/${act.act_number}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from('acts')
    .upload(pdfPath, buffer, { contentType: 'application/pdf', upsert: true });
  if (!uploadError) {
    await supabase.rpc('set_act_pdf_path', { act_id: act.id, pdf_path: pdfPath });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${act.act_number}.pdf"`,
    },
  });
}
