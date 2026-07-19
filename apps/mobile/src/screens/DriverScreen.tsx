import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { theme, ui } from '../ui';

type Task = {
  id: string;
  status: string;
  est_weight_kg: number | null;
  scheduled_date: string | null;
  order: { order_number: string } | null;
  dropoff: { name: string } | null;
  vehicle: { name: string } | null;
};
type Trip = { id: string; vehicle_id: string | null; odometer_start: number | null };

const card = {
  backgroundColor: theme.colors.panel,
  borderRadius: theme.radius.card,
  borderWidth: 1,
  borderColor: theme.colors.line,
  padding: theme.spacing.lg,
} as const;

export function DriverScreen({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [odometer, setOdometer] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [taskRes, tripRes] = await Promise.all([
      supabase
        .from('delivery_tasks')
        .select(
          'id, status, est_weight_kg, scheduled_date, order:orders(order_number), dropoff:locations!delivery_tasks_dropoff_location_id_fkey(name), vehicle:vehicles(name)',
        )
        .eq('assigned_to', userId)
        .in('status', ['assigned', 'picked_up'])
        .or(`scheduled_date.eq.${today},scheduled_date.is.null`),
      supabase
        .from('vehicle_trips')
        .select('id, vehicle_id, odometer_start')
        .eq('driver_id', userId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1),
    ]);
    setTasks((taskRes.data as unknown as Task[]) ?? []);
    setTrip(((tripRes.data as unknown as Trip[]) ?? [])[0] ?? null);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startTrip() {
    // trip runs on the vehicle from the driver's first assigned task
    const { data: firstWithVehicle } = await supabase
      .from('delivery_tasks')
      .select('vehicle_id')
      .eq('assigned_to', userId)
      .not('vehicle_id', 'is', null)
      .limit(1)
      .maybeSingle();
    const vid = firstWithVehicle?.vehicle_id;
    if (!vid) return;
    setBusy(true);
    await supabase.rpc('start_trip', {
      args: { vehicle_id: vid, odometer_start: odometer.trim() || null },
    });
    setOdometer('');
    await load();
    setBusy(false);
  }

  async function endTrip() {
    if (!trip) return;
    setBusy(true);
    await supabase.rpc('end_trip', {
      args: { trip_id: trip.id, odometer_end: odometer.trim() || null },
    });
    setOdometer('');
    await load();
    setBusy(false);
  }

  async function mark(taskId: string, status: 'picked_up' | 'delivered') {
    setBusy(true);
    await supabase.rpc('mark_delivery', {
      args: { task_id: taskId, status, trip_id: trip?.id ?? null },
    });
    await load();
    setBusy(false);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.ink }}
      contentContainerStyle={[ui.screen, { paddingBottom: 48 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={theme.colors.paper}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Text style={ui.brand}>{t('common.appName')}</Text>
      <Text style={ui.title}>{t('mobile.driver.title')}</Text>

      {/* trip control */}
      <View style={[card, { marginTop: theme.spacing.lg }]}>
        <Text style={[ui.label, { marginTop: 0 }]}>
          {trip ? t('mobile.driver.tripActive') : t('mobile.driver.noTrip')}
        </Text>
        <TextInput
          style={ui.input}
          value={odometer}
          onChangeText={setOdometer}
          keyboardType="number-pad"
          placeholder={trip ? t('mobile.driver.odometerEnd') : t('mobile.driver.odometerStart')}
          placeholderTextColor={theme.colors.dim}
        />
        <Pressable
          style={[ui.primaryButton, busy && { opacity: 0.4 }]}
          disabled={busy}
          onPress={() => void (trip ? endTrip() : startTrip())}
        >
          <Text style={ui.primaryButtonText}>
            {trip ? t('mobile.driver.endTrip') : t('mobile.driver.startTrip')}
          </Text>
        </Pressable>
      </View>

      <Text style={ui.label}>{t('mobile.driver.todayStops')}</Text>
      {tasks.length === 0 ? (
        <Text style={[ui.value, { color: theme.colors.dim }]}>{t('mobile.driver.noStops')}</Text>
      ) : null}
      {tasks.map((task) => (
        <View key={task.id} style={[card, { marginTop: theme.spacing.sm }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text style={[ui.value, { marginTop: 0, fontWeight: '800', flex: 1 }]}>
              {task.dropoff?.name ?? '—'}
            </Text>
            <Text style={{ color: theme.colors.hi, fontSize: 12, fontWeight: '700' }}>
              {t(`mobile.driver.status.${task.status}`)}
            </Text>
          </View>
          <Text style={ui.mono}>
            {task.order?.order_number ?? ''}
            {task.est_weight_kg ? `  ·  ${task.est_weight_kg} kg` : ''}
            {task.vehicle?.name ? `  ·  ${task.vehicle.name}` : ''}
          </Text>
          {task.status === 'assigned' ? (
            <Pressable
              style={[ui.secondaryButton, busy && { opacity: 0.4 }]}
              disabled={busy}
              onPress={() => void mark(task.id, 'picked_up')}
            >
              <Text style={ui.secondaryButtonText}>{t('mobile.driver.markPickedUp')}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[ui.primaryButton, busy && { opacity: 0.4 }]}
              disabled={busy}
              onPress={() => void mark(task.id, 'delivered')}
            >
              <Text style={ui.primaryButtonText}>{t('mobile.driver.markDelivered')}</Text>
            </Pressable>
          )}
        </View>
      ))}

      <Pressable style={ui.secondaryButton} onPress={onDone}>
        <Text style={ui.secondaryButtonText}>{t('mobile.handover.backHome')}</Text>
      </Pressable>
    </ScrollView>
  );
}
