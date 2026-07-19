import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
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

export function RequestsScreen({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'list' | 'new'>('list');
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [site, setSite] = useState<Site | null>(null);
  const [itemsText, setItemsText] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [isHot, setIsHot] = useState(false);
  const [hotReason, setHotReason] = useState<string | null>(null);
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
    if (supply || assigned.length === 0) {
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

  async function submit() {
    if (!site || itemsText.trim().length === 0 || (isHot && !hotReason)) return;
    setSaving(true);
    setError(null);
    try {
      const items = itemsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((raw_text) => ({ raw_text }));
      const { error: rpcError } = await supabase.rpc('create_material_request', {
        args: {
          site_id: site.id,
          needed_by: neededBy.trim() || null,
          is_hot: isHot,
          hot_reason: isHot ? hotReason : null,
          items,
        },
      });
      if (rpcError) throw rpcError;
      setItemsText('');
      setNeededBy('');
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

  if (mode === 'new') {
    const canSubmit =
      site !== null && itemsText.trim().length > 0 && (!isHot || hotReason !== null) && !saving;
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.ink }}
        contentContainerStyle={[ui.screen, { paddingBottom: 48 }]}
      >
        <Text style={ui.brand}>{t('common.appName')}</Text>
        <Text style={ui.title}>{t('mobile.requests.newCta')}</Text>

        <Text style={ui.label}>{t('mobile.requests.site')}</Text>
        {sites.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => setSite(s)}
            style={{
              minHeight: 44,
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.lg,
              borderRadius: theme.radius.button,
              borderWidth: 1,
              borderColor: site?.id === s.id ? theme.colors.hi : theme.colors.line,
              backgroundColor: theme.colors.panel2,
              marginTop: theme.spacing.sm,
            }}
          >
            <Text
              style={{
                color: theme.colors.paper,
                fontSize: 15,
                fontWeight: site?.id === s.id ? '800' : '400',
              }}
            >
              {s.name}
            </Text>
          </Pressable>
        ))}

        <Text style={ui.label}>{t('mobile.requests.itemsLabel')}</Text>
        <TextInput
          style={[ui.input, { minHeight: 120, textAlignVertical: 'top' }]}
          value={itemsText}
          onChangeText={setItemsText}
          multiline
          placeholderTextColor={theme.colors.dim}
        />

        <Text style={ui.label}>{t('mobile.requests.neededBy')}</Text>
        <TextInput
          style={ui.input}
          value={neededBy}
          onChangeText={setNeededBy}
          autoCapitalize="none"
          placeholder="2026-08-01"
          placeholderTextColor={theme.colors.dim}
        />

        <Pressable
          onPress={() => setIsHot((prev) => !prev)}
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
            {HOT_REASONS.map((reason) => (
              <Pressable
                key={reason}
                onPress={() => setHotReason(reason)}
                style={{
                  minHeight: 40,
                  justifyContent: 'center',
                  paddingHorizontal: theme.spacing.lg,
                  borderRadius: theme.radius.buttonSm,
                  borderWidth: 1,
                  borderColor: hotReason === reason ? theme.colors.hot : theme.colors.line,
                  backgroundColor: theme.colors.panel2,
                  marginTop: theme.spacing.sm,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.paper,
                    fontSize: 14,
                    fontWeight: hotReason === reason ? '800' : '400',
                  }}
                >
                  {t(`mobile.requests.reasons.${reason}`)}
                </Text>
              </Pressable>
            ))}
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
        <View key={req.id} style={[card, { marginTop: theme.spacing.md }]}>
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
        </View>
      ))}
    </ScrollView>
  );
}
