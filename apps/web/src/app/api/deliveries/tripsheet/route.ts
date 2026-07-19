import { NextResponse, type NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/org';
import { renderTripSheet, type TripSheetData } from '@/lib/logistics/pdf';
import { loadTasksForVehicleDay } from '../_shared';

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) return new NextResponse(null, { status: 401 });
  const vehicleId = request.nextUrl.searchParams.get('vehicle') ?? '';
  const date = request.nextUrl.searchParams.get('date') ?? '';
  if (!vehicleId || !date) return new NextResponse('missing params', { status: 400 });

  const supabase = await getSupabaseServer();
  const orgId = ctx.activeOrg.orgId;
  const [{ data: vehicle }, tasks, t, org] = await Promise.all([
    supabase.from('vehicles').select('name, plate_number').eq('id', vehicleId).maybeSingle(),
    loadTasksForVehicleDay(supabase, orgId, vehicleId, date),
    getTranslations('deliveries.tripsheet'),
    supabase.from('organizations').select('name').eq('id', orgId).maybeSingle(),
  ]);
  if (tasks.length === 0) return new NextResponse('no stops', { status: 404 });

  // driver from the first task's assignment
  const { data: firstTask } = await supabase
    .from('delivery_tasks')
    .select('driver:profiles!delivery_tasks_assigned_to_fkey(full_name)')
    .eq('vehicle_id', vehicleId)
    .eq('scheduled_date', date)
    .not('assigned_to', 'is', null)
    .limit(1)
    .maybeSingle();

  const data: TripSheetData = {
    labels: {
      title: t('title'),
      date: t('date'),
      vehicle: t('vehicle'),
      plate: t('plate'),
      driver: t('driver'),
      stop: t('stop'),
      order: t('order'),
      crane: t('crane'),
      odoStart: t('odoStart'),
      odoEnd: t('odoEnd'),
      km: t('km'),
      generated: t('generated'),
    },
    orgName: org.data?.name ?? '',
    dateText: date,
    vehicleName: vehicle?.name ?? '',
    plate: vehicle?.plate_number ?? '',
    driverName: firstTask?.driver?.full_name ?? '',
    stops: tasks.map((task, i) => ({
      seq: task.stopOrder ?? i + 1,
      site: task.site,
      address: task.address,
      orderNumber: task.orderNumber,
      craneHeightM: task.craneHeightM,
      craneMinutes: task.craneMinutes,
      lines: task.lines,
    })),
  };

  const pdf = await renderTripSheet(data);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="tripsheet-${date}.pdf"`,
    },
  });
}
