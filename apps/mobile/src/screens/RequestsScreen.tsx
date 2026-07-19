import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { theme, ui } from '../ui';

type Site = { id: string; name: string };
type RequestItem = { id: string; raw_text: string; status: string; qty: number | null; unit: string | null };
type MaterialRequest = {
  id: string;
  status: string;
  is_hot: boolean;
  needed_by: string | null;
  created_at: string;
  site: { name: string } | null;
  items: RequestItem[];
};

const HOT_REASONS = [
  'planning_miss',
  'scope_change',
  'emergency',
  'vendor_fail',
  'weather',
  'other',
] as const;

// standard construction units — structured qty/unit per line feeds the
// order→delivery→invoice reconciliation chain (OWNER AMENDMENT SPEC 3.1)
const UNITS = ['vnt', 'm', 'm2', 'm3', 'kg', 't', 'l', 'pak', 'dėž', 'rul', 'kompl'] as const;

type ItemRow = { text: string; qty: string; unit: string };

const EMPTY_ROW: ItemRow = { text: '', qty: '', unit: 'vnt' };

// UI glyphs, not translatable copy
const CARET = '▼';
const CLEAR = '✕';

const STATUS_COLOR: Record<string, string> = {
  open: theme.colors.blue,
  processing: theme.colors.hi,
  ordered: theme.colors.ok,
  delivered: theme.colors.ok,
  cancelled: theme.colors.dim,
};

const card = {
  backgroundColor: theme.colors.panel,
  borderRadius: theme.radius.card,
  borderWidth: 1,
  borderColor: theme.colors.line,
  padding: theme.spacing.lg,
} as const;

const dropdownField = {
  minHeight: 44,
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: theme.spacing.lg,
  borderRadius: theme.radius.button,
  borderWidth: 1,
  borderColor: theme.colors.line,
  backgroundColor: theme.colors.panel,
  marginTop: theme.spacing.xs,
} as const;

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function RequestsScreen({
  userId,
  onImmersive,
}: {
  userId: string;
  onImmersive: (immersive: boolean) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'list' | 'new'>('list');
  const [detail, setDetail] = useState<MaterialRequest | null>(null);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [site, setSite] = useState<Site | null>(null);
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [rows, setRows] = useState<ItemRow[]>([{ ...EMPTY_ROW }]);
  const [unitPickerRow, setUnitPickerRow] = useState<number | null>(null);
  const [neededBy, setNeededBy] = useState<Date | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [isHot, setIsHot] = useState(false);
  const [hotReason, setHotReason] = useState<string | null>(null);
  const [reasonPickerOpen, setReasonPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [reqRes, assignRes, memberRes] = await Promise.all([
      supabase
        .from('material_requests')
        .select(
          'id, status, is_hot, needed_by, created_at, site:locations(name), items:material_request_items(id, raw_text, status, qty, unit)',
        )
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('site_assignments').select('site:locations(id, name)').eq('user_id', userId),
      supabase.from('memberships').select('role').eq('user_id', userId),
    ]);
    setRequests((reqRes.data as unknown as MaterialRequest[]) ?? []);
    const assigned = ((assignRes.data ?? []) as unknown as { site: Site | null }[])
      .map((row) => row.site)
      .filter((s): s is Site => s !== null);
    const supply = (memberRes.data ?? []).some((m) =>
      ['owner', 'admin', 'supply_manager'].includes(m.role as string),
    );
    // OWNER AMENDMENT SPEC 3.1: workers see ONLY their assigned sites —
    // no fallback to the whole org list. Supply roles dispatch for everyone.
    if (supply) {
      const { data } = await supabase
        .from('locations')
        .select('id, name')
        .eq('type', 'site')
        .order('name');
      setSites((data as Site[]) ?? []);
    } else {
      setSites(assigned);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // form/detail take the full screen — hide the bottom tabs so nothing
  // sits under them (owner-reported: form bottom was unreachable)
  useEffect(() => {
    onImmersive(mode !== 'list' || detail !== null);
  }, [mode, detail, onImmersive]);

  function setRow(index: number, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  const filledRows = rows.filter((row) => row.text.trim().length > 0);

  async function submit() {
    if (!site || filledRows.length === 0 || (isHot && !hotReason)) return;
    setSaving(true);
    setError(null);
    try {
      const items = filledRows.map((row) => ({
        raw_text: row.text.trim(),
        qty: row.qty.trim() ? row.qty.trim().replace(',', '.') : null,
        unit: row.unit,
      }));
      const { error: rpcError } = await supabase.rpc('create_material_request', {
        args: {
          site_id: site.id,
          needed_by: neededBy ? toIsoDate(neededBy) : null,
          is_hot: isHot,
          hot_reason: isHot ? hotReason : null,
          items,
        },
      });
      if (rpcError) throw rpcError;
      setRows([{ ...EMPTY_ROW }]);
      setNeededBy(null);
      setIsHot(false);
      setHotReason(null);
      setMode('list');
      await load();
    } catch {
      setError(t('mobile.requests.failed'));
    } finally {
      setSaving(false);
    }
  }

  if (detail) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.ink }}
        contentContainerStyle={[ui.screen, { paddingBottom: 140 }]}
      >
        <Text style={ui.brand}>{t('common.appName')}</Text>
        <Text style={ui.title}>{detail.site?.name ?? t('mobile.requests.title')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
          {detail.is_hot ? (
            <View style={[ui.stamp, { borderColor: theme.colors.hot, marginTop: 0 }]}>
              <Text style={[ui.stampText, { color: theme.colors.hot }]}>
                {t('mobile.requests.hotStamp')}
              </Text>
            </View>
          ) : null}
          <View
            style={[
              ui.stamp,
              { borderColor: STATUS_COLOR[detail.status] ?? theme.colors.line, marginTop: 0 },
            ]}
          >
            <Text
              style={[ui.stampText, { color: STATUS_COLOR[detail.status] ?? theme.colors.dim }]}
            >
              {t(`mobile.requests.status.${detail.status}`)}
            </Text>
          </View>
        </View>
        <Text style={[ui.mono, { marginTop: theme.spacing.md }]}>
          {new Date(detail.created_at).toLocaleDateString('lt-LT')}
          {detail.needed_by ? `  →  ${detail.needed_by}` : ''}
        </Text>

        <Text style={ui.label}>{t('mobile.requests.itemsLabel')}</Text>
        {detail.items.map((item) => (
          <View key={item.id} style={[card, { marginTop: theme.spacing.sm }]}>
            <Text style={[ui.value, { marginTop: 0 }]}>{item.raw_text}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: theme.spacing.xs }}>
              <Text style={[ui.mono, { flex: 1 }]}>
                {item.qty ? `${item.qty} ${item.unit ?? ''}` : '—'}
              </Text>
              <Text style={{ color: theme.colors.dim, fontSize: 12, fontWeight: '700' }}>
                {t(`mobile.requests.itemStatus.${item.status}`)}
              </Text>
            </View>
          </View>
        ))}

        <Pressable style={ui.primaryButton} onPress={() => setDetail(null)}>
          <Text style={ui.primaryButtonText}>{t('mobile.handover.back')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (mode === 'new') {
    const canSubmit =
      site !== null && filledRows.length > 0 && (!isHot || hotReason !== null) && !saving;
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.ink }}
        contentContainerStyle={[ui.screen, { paddingBottom: 140 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={ui.brand}>{t('common.appName')}</Text>
        <Text style={ui.title}>{t('mobile.requests.newCta')}</Text>

        <Text style={ui.label}>{t('mobile.requests.site')}</Text>
        {sites.length === 0 ? (
          <Text style={[ui.value, { color: theme.colors.dim }]}>
            {t('mobile.requests.noSites')}
          </Text>
        ) : (
          <Pressable style={dropdownField} onPress={() => setSitePickerOpen(true)}>
            <Text
              style={{
                flex: 1,
                color: site ? theme.colors.paper : theme.colors.dim,
                fontSize: 15,
                fontWeight: site ? '700' : '400',
              }}
            >
              {site?.name ?? t('mobile.requests.sitePlaceholder')}
            </Text>
            <Text style={{ color: theme.colors.dim, fontSize: 12 }}>{CARET}</Text>
          </Pressable>
        )}

        <Text style={ui.label}>{t('mobile.requests.itemsLabel')}</Text>
        {rows.map((row, index) => (
          <View key={index} style={{ marginTop: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <TextInput
                style={[ui.input, { flex: 1, marginTop: 0 }]}
                value={row.text}
                onChangeText={(text) => setRow(index, { text })}
                placeholder={t('mobile.requests.itemText')}
                placeholderTextColor={theme.colors.dim}
              />
              {rows.length > 1 ? (
                <Pressable
                  onPress={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  style={{ justifyContent: 'center', paddingHorizontal: 6 }}
                  hitSlop={8}
                >
                  <Text style={{ color: theme.colors.dim, fontSize: 17 }}>{CLEAR}</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
              <TextInput
                style={[ui.input, { flex: 1, marginTop: 0 }]}
                value={row.qty}
                onChangeText={(qty) => setRow(index, { qty })}
                keyboardType="decimal-pad"
                placeholder={t('mobile.requests.itemQty')}
                placeholderTextColor={theme.colors.dim}
              />
              <Pressable
                style={[dropdownField, { flex: 1, marginTop: 0 }]}
                onPress={() => setUnitPickerRow(index)}
              >
                <Text style={{ flex: 1, color: theme.colors.paper, fontSize: 15, fontWeight: '700' }}>
                  {row.unit}
                </Text>
                <Text style={{ color: theme.colors.dim, fontSize: 12 }}>{CARET}</Text>
              </Pressable>
            </View>
          </View>
        ))}
        <Pressable
          style={[ui.secondaryButton, { marginTop: theme.spacing.md }]}
          onPress={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}
        >
          <Text style={ui.secondaryButtonText}>{t('mobile.requests.addItem')}</Text>
        </Pressable>

        <Text style={ui.label}>{t('mobile.requests.neededBy')}</Text>
        <Pressable style={dropdownField} onPress={() => setDatePickerOpen(true)}>
          <Text
            style={{
              flex: 1,
              color: neededBy ? theme.colors.paper : theme.colors.dim,
              fontSize: 15,
              fontWeight: neededBy ? '700' : '400',
            }}
          >
            {neededBy ? toIsoDate(neededBy) : t('mobile.requests.pickDate')}
          </Text>
          {neededBy ? (
            <Pressable onPress={() => setNeededBy(null)} hitSlop={12}>
              <Text style={{ color: theme.colors.dim, fontSize: 15 }}>{CLEAR}</Text>
            </Pressable>
          ) : (
            <Text style={{ color: theme.colors.dim, fontSize: 12 }}>{CARET}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setIsHot((prev) => {
              const next = !prev;
              if (next) {
                setReasonPickerOpen(true); // pick the reason right away
              } else {
                setHotReason(null);
              }
              return next;
            });
          }}
          style={{
            minHeight: 44,
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.lg,
            borderRadius: theme.radius.button,
            borderWidth: 1,
            borderColor: isHot ? theme.colors.hot : theme.colors.line,
            backgroundColor: theme.colors.panel2,
            marginTop: theme.spacing.lg,
          }}
        >
          <Text style={{ color: isHot ? theme.colors.hot : theme.colors.paper, fontSize: 15, fontWeight: isHot ? '800' : '400' }}>
            {t('mobile.requests.hotToggle')}
          </Text>
        </Pressable>
        {isHot ? (
          <View>
            <Text style={ui.label}>{t('mobile.requests.hotReason')}</Text>
            <Pressable
              style={[dropdownField, { borderColor: theme.colors.hot }]}
              onPress={() => setReasonPickerOpen(true)}
            >
              <Text
                style={{
                  flex: 1,
                  color: hotReason ? theme.colors.paper : theme.colors.dim,
                  fontSize: 15,
                  fontWeight: hotReason ? '700' : '400',
                }}
              >
                {hotReason
                  ? t(`mobile.requests.reasons.${hotReason}`)
                  : t('mobile.requests.pickReason')}
              </Text>
              <Text style={{ color: theme.colors.dim, fontSize: 12 }}>{CARET}</Text>
            </Pressable>
          </View>
        ) : null}

        {error ? <Text style={ui.error}>{error}</Text> : null}

        <Pressable
          style={[ui.primaryButton, !canSubmit && { opacity: 0.4 }]}
          disabled={!canSubmit}
          onPress={() => void submit()}
        >
          <Text style={ui.primaryButtonText}>{t('mobile.requests.submit')}</Text>
        </Pressable>
        <Pressable style={ui.secondaryButton} onPress={() => setMode('list')}>
          <Text style={ui.secondaryButtonText}>{t('mobile.handover.back')}</Text>
        </Pressable>

        <Modal visible={sitePickerOpen} transparent animationType="fade">
          <Pressable
            style={{ flex: 1, backgroundColor: theme.colors.scrim, justifyContent: 'center', padding: 24 }}
            onPress={() => setSitePickerOpen(false)}
          >
            <View style={[card, { maxHeight: '70%' }]}>
              <Text style={[ui.label, { marginTop: 0 }]}>{t('mobile.requests.site')}</Text>
              <ScrollView>
                {sites.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => {
                      setSite(s);
                      setSitePickerOpen(false);
                    }}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text
                      style={{
                        color: site?.id === s.id ? theme.colors.hi : theme.colors.paper,
                        fontSize: 16,
                        fontWeight: site?.id === s.id ? '800' : '400',
                      }}
                    >
                      {s.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        <Modal visible={reasonPickerOpen} transparent animationType="fade">
          <Pressable
            style={{ flex: 1, backgroundColor: theme.colors.scrim, justifyContent: 'center', padding: 24 }}
            onPress={() => setReasonPickerOpen(false)}
          >
            <View style={card}>
              <Text style={[ui.label, { marginTop: 0 }]}>{t('mobile.requests.hotReason')}</Text>
              {HOT_REASONS.map((reason) => (
                <Pressable
                  key={reason}
                  onPress={() => {
                    setHotReason(reason);
                    setReasonPickerOpen(false);
                  }}
                  style={{ minHeight: 48, justifyContent: 'center' }}
                >
                  <Text
                    style={{
                      color: hotReason === reason ? theme.colors.hot : theme.colors.paper,
                      fontSize: 16,
                      fontWeight: hotReason === reason ? '800' : '400',
                    }}
                  >
                    {t(`mobile.requests.reasons.${reason}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>

        <Modal visible={unitPickerRow !== null} transparent animationType="fade">
          <Pressable
            style={{ flex: 1, backgroundColor: theme.colors.scrim, justifyContent: 'center', padding: 24 }}
            onPress={() => setUnitPickerRow(null)}
          >
            <View style={card}>
              <Text style={[ui.label, { marginTop: 0 }]}>{t('mobile.requests.itemUnit')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {UNITS.map((unit) => (
                  <Pressable
                    key={unit}
                    onPress={() => {
                      if (unitPickerRow !== null) setRow(unitPickerRow, { unit });
                      setUnitPickerRow(null);
                    }}
                    style={{
                      minHeight: 44,
                      minWidth: 64,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: theme.radius.button,
                      borderWidth: 1,
                      borderColor:
                        unitPickerRow !== null && rows[unitPickerRow]?.unit === unit
                          ? theme.colors.hi
                          : theme.colors.line,
                      backgroundColor: theme.colors.panel2,
                    }}
                  >
                    <Text style={{ color: theme.colors.paper, fontSize: 15, fontWeight: '700' }}>
                      {unit}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Pressable>
        </Modal>

        {datePickerOpen && Platform.OS === 'android' ? (
          <DateTimePicker
            value={neededBy ?? new Date()}
            mode="date"
            minimumDate={new Date()}
            onChange={(event, date) => {
              setDatePickerOpen(false);
              if (event.type === 'set' && date) setNeededBy(date);
            }}
          />
        ) : null}
        {Platform.OS === 'ios' ? (
          <Modal visible={datePickerOpen} transparent animationType="fade">
            <Pressable
              style={{ flex: 1, backgroundColor: theme.colors.scrim, justifyContent: 'center', padding: 24 }}
              onPress={() => setDatePickerOpen(false)}
            >
              <View style={[card, { backgroundColor: theme.colors.panel }]}>
                <DateTimePicker
                  value={neededBy ?? new Date()}
                  mode="date"
                  display="inline"
                  minimumDate={new Date()}
                  themeVariant="dark"
                  onChange={(event, date) => {
                    if (date) setNeededBy(date);
                    setDatePickerOpen(false);
                  }}
                />
              </View>
            </Pressable>
          </Modal>
        ) : null}
      </ScrollView>
    );
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
      <Text style={ui.title}>{t('mobile.requests.title')}</Text>

      <Pressable style={ui.primaryButton} onPress={() => setMode('new')}>
        <Text style={ui.primaryButtonText}>{t('mobile.requests.newCta')}</Text>
      </Pressable>

      {requests.length === 0 ? (
        <Text style={[ui.value, { marginTop: theme.spacing.lg }]}>
          {t('mobile.requests.empty')}
        </Text>
      ) : null}

      {requests.map((req) => (
        <Pressable key={req.id} style={[card, { marginTop: theme.spacing.md }]} onPress={() => setDetail(req)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text style={[ui.value, { fontWeight: '800', flex: 1 }]}>
              {req.site?.name ?? '—'}
            </Text>
            {req.is_hot ? (
              <Text style={{ color: theme.colors.hot, fontWeight: '900', fontSize: 12 }}>
                {t('mobile.requests.hotStamp')}
              </Text>
            ) : null}
            <Text
              style={{
                color: STATUS_COLOR[req.status] ?? theme.colors.dim,
                fontWeight: '800',
                fontSize: 12,
              }}
            >
              {t(`mobile.requests.status.${req.status}`)}
            </Text>
          </View>
          <Text style={ui.mono}>
            {new Date(req.created_at).toLocaleDateString('lt-LT')}
            {req.needed_by ? ` → ${req.needed_by}` : ''}
          </Text>
          {req.items.map((item) => (
            <View
              key={item.id}
              style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: theme.spacing.sm }}
            >
              <Text style={[ui.value, { flex: 1 }]}>
                {item.raw_text}
                {item.qty ? `  ·  ${item.qty} ${item.unit ?? ''}` : ''}
              </Text>
              <Text style={{ color: theme.colors.dim, fontSize: 11 }}>
                {t(`mobile.requests.itemStatus.${item.status}`)}
              </Text>
            </View>
          ))}
        </Pressable>
      ))}
    </ScrollView>
  );
}
