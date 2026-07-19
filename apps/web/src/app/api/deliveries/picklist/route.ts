import { NextResponse, type NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { renderPickList, type PickListData } from '@/lib/logistics/pdf';
import { loadTasksForVehicleDay, type TaskLine } from '../_shared';

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) return new NextResponse(null, { status: 401 });
  const vehicleId = request.nextUrl.searchParams.get('vehicle') ?? '';
  const date = request.nextUrl.searchParams.get('date') ?? '';
  if (!vehicleId || !date) return new NextResponse('missing params', { status: 400 });

  const supabase = await getSupabaseServer();
  const orgId = ctx.activeOrg.orgId;
  const [{ data: vehicle }, tasks, t, org] = await Promise.all([
    supabase.from('vehicles').select('name').eq('id', vehicleId).maybeSingle(),
    loadTasksForVehicleDay(supabase, orgId, vehicleId, date),
    getTranslations('deliveries.picklist'),
    supabase.from('organizations').select('name').eq('id', orgId).maybeSingle(),
  ]);
  if (tasks.length === 0) return new NextResponse('no stops', { status: 404 });

  // aggregate lines across all stops, grouped by pickup location + material
  const byPickup = new Map<string, Map<string, TaskLine>>();
  for (const task of tasks) {
    const group = byPickup.get(task.pickup) ?? new Map<string, TaskLine>();
    for (const line of task.lines) {
      const key = `${line.description}|${line.unit}`;
      const existing = group.get(key);
      if (existing) existing.qty += line.qty;
      else group.set(key, { ...line });
    }
    byPickup.set(task.pickup, group);
  }

  const data: PickListData = {
    labels: {
      title: t('title'),
      date: t('date'),
      vehicle: t('vehicle'),
      driver: t('driver'),
      pickup: t('pickup'),
      material: t('material'),
      qty: t('qty'),
      weight: t('weight'),
      total: t('total'),
      generated: t('generated'),
    },
    orgName: org.data?.name ?? '',
    dateText: date,
    vehicleName: vehicle?.name ?? '',
    driverName: '',
    groups: [...byPickup.entries()].map(([pickup, lines]) => ({
      pickup,
      lines: [...lines.values()],
    })),
  };

  const pdf = await renderPickList(data);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="picklist-${date}.pdf"`,
    },
  });
}
