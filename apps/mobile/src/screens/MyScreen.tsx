import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { onOutboxChange, pendingCount, syncOutbox } from '../lib/outbox';
import { theme, ui } from '../ui';

export type PendingAct = {
  id: string;
  act_number: string;
  action: string;
  toolName: string;
  initiatedBy: string;
  initiatedAt: string;
};

type Reminder = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
  toolId: string | null;
};

type HeldTool = {
  id: string;
  name: string;
  qr_code: string | null;
  purchase_price: number | null;
  ownership: string;
  rental_due_return: string | null;
  heldSince: string | null;
};

function daysBetween(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}
function daysUntil(date: string): number {
  return Math.ceil((Date.parse(date) - Date.now()) / 86_400_000);
}

export function MyScreen({
  userId,
  onScan,
  onCountersign,
  onOpenTool,
  onSignOut,
}: {
  userId: string;
  onScan: () => void;
  onCountersign: (actId: string) => void;
  onOpenTool: (toolId: string) => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingAct[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [tools, setTools] = useState<HeldTool[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [outbox, setOutbox] = useState(pendingCount());

  useEffect(() => onOutboxChange(() => setOutbox(pendingCount())), []);

  const load = useCallback(async () => {
    // roles per org (for supply-side return confirmations)
    const { data: memberships } = await supabase
      .from('memberships')
      .select('org_id, role')
      .eq('user_id', userId);
    const supplyOrgs = new Set(
      (memberships ?? [])
        .filter((m) => ['owner', 'admin', 'supply_manager'].includes(m.role))
        .map((m) => m.org_id),
    );

    const { data: acts } = await supabase
      .from('handover_acts')
      .select(
        `id, org_id, act_number, giver_id, receiver_id,
         giver_signature_path, receiver_signature_path, created_at,
         movement:tool_movements!handover_acts_movement_id_fkey(
           action, performed_at,
           performer:profiles!tool_movements_performed_by_fkey(full_name),
           tool:tools(name, qr_code))`,
      )
      .eq('status', 'pending_signatures')
      .order('created_at', { ascending: false });

    const mine: PendingAct[] = [];
    for (const act of acts ?? []) {
      const receiverPending = act.receiver_signature_path === null;
      const giverPending = act.giver_signature_path === null;
      const isMine =
        (receiverPending && act.receiver_id === userId) ||
        (giverPending && act.giver_id === userId) ||
        (receiverPending && act.receiver_id === null && supplyOrgs.has(act.org_id));
      if (!isMine) continue;
      mine.push({
        id: act.id,
        act_number: act.act_number,
        action: act.movement?.action ?? '',
        toolName: act.movement?.tool?.name ?? '',
        initiatedBy: act.movement?.performer?.full_name ?? '',
        initiatedAt: (act.movement?.performed_at ?? act.created_at).slice(0, 16).replace('T', ' '),
      });
    }
    setPending(mine);

    // reminders: unread, excluding signature-request/act notifications
    // (those already surface as pending acts above)
    const { data: notes } = await supabase
      .from('notifications')
      .select('id, type, title, body, created_at, entity_type, entity_id')
      .eq('user_id', userId)
      .is('read_at', null)
      .neq('entity_type', 'handover_act')
      .order('created_at', { ascending: false })
      .limit(20);
    setReminders(
      (notes ?? []).map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        createdAt: n.created_at.slice(0, 16).replace('T', ' '),
        toolId: n.entity_type === 'tool' ? n.entity_id : null,
      })),
    );

    const { data: held } = await supabase
      .from('tools')
      .select('id, name, qr_code, purchase_price, ownership, rental_due_return')
      .eq('current_holder_id', userId)
      .eq('status', 'checked_out');

    const heldTools: HeldTool[] = [];
    for (const tool of held ?? []) {
      const { data: lastMove } = await supabase
        .from('tool_movements')
        .select('performed_at')
        .eq('tool_id', tool.id)
        .in('action', ['checkout', 'transfer'])
        .order('performed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      heldTools.push({ ...tool, heldSince: lastMove?.performed_at ?? null });
    }
    setTools(heldTools);
  }, [userId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('my-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, userId]);

  const total = tools.reduce((sum, tool) => sum + (tool.purchase_price ?? 0), 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.ink }}
      contentContainerStyle={[ui.screen, { paddingBottom: 48 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
          tintColor={theme.colors.hi}
        />
      }
    >
      <Text style={ui.brand}>{t('common.appName')}</Text>
      <Text style={ui.title}>{t('mobile.my.title')}</Text>

      <Text style={ui.label}>{t('mobile.my.totalLabel')}</Text>
      <Text
        style={{
          color: theme.colors.paper,
          fontWeight: '900',
          fontSize: 44,
          letterSpacing: theme.typography.display.letterSpacing,
        }}
      >
        {`€ ${total.toFixed(2)}`}
      </Text>

      <Pressable style={[ui.primaryButton, { minHeight: 64 }]} onPress={onScan}>
        <Text style={[ui.primaryButtonText, { fontSize: 18 }]}>{t('mobile.my.scanCta')}</Text>
      </Pressable>

      {outbox > 0 ? (
        <Pressable
          onPress={() => {
            void syncOutbox().then(() => {
              setOutbox(pendingCount());
              void load();
            });
          }}
          style={{
            marginTop: theme.spacing.md,
            borderRadius: theme.radius.button,
            borderWidth: 1,
            borderColor: theme.colors.steel,
            padding: theme.spacing.lg,
          }}
        >
          <Text style={[ui.stampText, { color: theme.colors.steel }]}>
            {t('mobile.my.outboxStamp', { count: outbox })}
          </Text>
          <Text style={{ color: theme.colors.paper, fontWeight: '700', marginTop: 4 }}>
            {t('mobile.my.syncNow')}
          </Text>
        </Pressable>
      ) : null}

      <Text style={ui.label}>{t('mobile.my.pendingTitle')}</Text>
      {pending.length === 0 ? (
        <Text style={[ui.mono, { marginTop: 6 }]}>{t('mobile.my.pendingEmpty')}</Text>
      ) : (
        pending.map((act) => (
          <Pressable
            key={act.id}
            onPress={() => onCountersign(act.id)}
            style={{
              marginTop: theme.spacing.sm,
              borderRadius: theme.radius.button,
              borderWidth: 1,
              borderColor: theme.colors.hi,
              backgroundColor: theme.colors.panel2,
              padding: theme.spacing.lg,
            }}
          >
            <Text style={[ui.mono, { color: theme.colors.hi }]}>{act.act_number}</Text>
            <Text style={{ color: theme.colors.paper, fontSize: 16, fontWeight: '700', marginTop: 4 }}>
              {tActionLabel(act.action, t)} — {act.toolName}
            </Text>
            <Text style={[ui.mono, { marginTop: 4 }]}>
              {t('mobile.my.initiatedBy', { name: act.initiatedBy, date: act.initiatedAt })}
            </Text>
            <Text style={{ color: theme.colors.hi, fontWeight: '700', marginTop: 8 }}>
              {t('mobile.my.signAction')}
            </Text>
          </Pressable>
        ))
      )}

      {reminders.length > 0 ? (
        <>
          <Text style={ui.label}>{t('mobile.my.remindersTitle')}</Text>
          {reminders.map((reminder) => {
            const color =
              reminder.type === 'rental_due' || reminder.type === 'system'
                ? theme.colors.hot
                : theme.colors.hi;
            return (
              <Pressable
                key={reminder.id}
                onPress={() => {
                  if (reminder.toolId) onOpenTool(reminder.toolId);
                }}
                style={{
                  marginTop: theme.spacing.sm,
                  borderRadius: theme.radius.button,
                  borderWidth: 1,
                  borderColor: theme.colors.line,
                  backgroundColor: theme.colors.panel2,
                  padding: theme.spacing.lg,
                }}
              >
                <Text style={{ color, fontSize: 15, fontWeight: '700' }}>{reminder.title}</Text>
                {reminder.body ? (
                  <Text style={{ color: theme.colors.steel, fontSize: 13, marginTop: 2 }}>
                    {reminder.body}
                  </Text>
                ) : null}
                <Text style={[ui.mono, { marginTop: 4 }]}>{reminder.createdAt}</Text>
              </Pressable>
            );
          })}
          <Pressable
            style={[ui.secondaryButton, { marginTop: theme.spacing.sm }]}
            onPress={() => {
              void supabase
                .from('notifications')
                .update({ read_at: new Date().toISOString() })
                .eq('user_id', userId)
                .is('read_at', null)
                .neq('entity_type', 'handover_act')
                .then(() => void load());
            }}
          >
            <Text style={ui.secondaryButtonText}>{t('mobile.my.markAllRead')}</Text>
          </Pressable>
        </>
      ) : null}

      <Text style={ui.label}>{t('mobile.my.toolsTitle')}</Text>
      {tools.length === 0 ? (
        <Text style={[ui.mono, { marginTop: 6 }]}>{t('mobile.my.toolsEmpty')}</Text>
      ) : (
        tools.map((tool) => {
          const days = tool.heldSince ? daysBetween(tool.heldSince) : null;
          const dueDays = tool.rental_due_return ? daysUntil(tool.rental_due_return) : null;
          const overdue = tool.ownership === 'rented' && dueDays !== null && dueDays < 0;
          const dueSoon =
            tool.ownership === 'rented' && dueDays !== null && dueDays >= 0 && dueDays <= 3;
          return (
            <View
              key={tool.id}
              style={{
                marginTop: theme.spacing.sm,
                borderRadius: theme.radius.button,
                borderWidth: 1,
                borderColor: theme.colors.line,
                backgroundColor: theme.colors.panel2,
                padding: theme.spacing.lg,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: theme.colors.paper, fontSize: 16, fontWeight: '600', flex: 1 }}>
                  {tool.name}
                </Text>
                <Text style={{ color: theme.colors.paper, fontWeight: '800' }}>
                  {tool.purchase_price !== null ? `€ ${Number(tool.purchase_price).toFixed(0)}` : ''}
                </Text>
              </View>
              <Text style={[ui.mono, { marginTop: 4 }]}>{tool.qr_code}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {days !== null ? (
                  <View style={[ui.stamp, { marginTop: 0, borderColor: days > 14 ? theme.colors.hi : theme.colors.line }]}>
                    <Text style={[ui.stampText, { color: days > 14 ? theme.colors.hi : theme.colors.steel }]}>
                      {days > 14
                        ? `${t('mobile.my.longHoldStamp')} · ${t('mobile.my.daysHeld', { days })}`
                        : t('mobile.my.daysHeld', { days })}
                    </Text>
                  </View>
                ) : null}
                {overdue ? (
                  <View style={[ui.stamp, { marginTop: 0, borderColor: theme.colors.hot }]}>
                    <Text style={[ui.stampText, { color: theme.colors.hot }]}>
                      {t('mobile.my.rentalOverdueStamp', { days: Math.abs(dueDays ?? 0) })}
                    </Text>
                  </View>
                ) : null}
                {dueSoon ? (
                  <View style={[ui.stamp, { marginTop: 0, borderColor: theme.colors.hi }]}>
                    <Text style={[ui.stampText, { color: theme.colors.hi }]}>
                      {t('mobile.my.rentalDueStamp', { date: tool.rental_due_return })}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })
      )}

      <Pressable style={ui.secondaryButton} onPress={onSignOut}>
        <Text style={ui.secondaryButtonText}>{t('mobile.scan.signOut')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function tActionLabel(action: string, t: (key: string) => string): string {
  if (action === 'checkout') return t('mobile.handover.titleCheckout');
  if (action === 'checkin') return t('mobile.handover.titleCheckin');
  return t('mobile.handover.titleTransfer');
}
