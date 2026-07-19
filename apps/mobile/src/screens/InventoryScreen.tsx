import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { searchTools, type ToolSearchRow } from '../lib/tools';
import { theme, ui } from '../ui';

type LocationRow = { id: string; name: string; type: string };
type Phase =
  | { name: 'pick' }
  | { name: 'scanning'; sessionId: string; location: LocationRow }
  | { name: 'summary'; found: number; misplaced: number; missing: number };

export function InventoryScreen({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>({ name: 'pick' });
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [expected, setExpected] = useState<Set<string>>(new Set());
  const [scanned, setScanned] = useState<Map<string, 'found' | 'misplaced'>>(new Map());
  const [lastScan, setLastScan] = useState<{ name: string; result: 'found' | 'misplaced' } | null>(null);
  const [markLost, setMarkLost] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ToolSearchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    void supabase
      .from('locations')
      .select('id, name, type')
      .eq('is_active', true)
      .in('type', ['site', 'warehouse'])
      .order('type')
      .then(({ data }) => setLocations((data as LocationRow[]) ?? []));
  }, []);

  useEffect(() => {
    if (!showSearch) return;
    const timer = setTimeout(() => {
      void searchTools(query).then(setResults);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, showSearch]);

  async function start(location: LocationRow) {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('start_inventory_session', {
      target_location: location.id,
    });
    if (rpcError || !data) {
      setError(
        rpcError?.message.includes('session_already_open')
          ? t('mobile.inventory.alreadyOpen')
          : t('mobile.inventory.failed'),
      );
      return;
    }
    const { data: tools } = await supabase
      .from('tools')
      .select('id')
      .eq('current_location_id', location.id)
      .in('status', ['available', 'checked_out', 'in_service']);
    setExpected(new Set((tools ?? []).map((row) => row.id)));
    setScanned(new Map());
    setPhase({ name: 'scanning', sessionId: data, location });
  }

  async function recordTool(toolId: string, toolName: string) {
    if (phase.name !== 'scanning' || scanned.has(toolId)) return;
    const { data, error: rpcError } = await supabase.rpc('record_inventory_scan', {
      target_session: phase.sessionId,
      target_tool: toolId,
    });
    if (rpcError || !data) return;
    const result = (data as { result: 'found' | 'misplaced' }).result;
    setScanned((prev) => new Map(prev).set(toolId, result));
    setLastScan({ name: toolName, result });
  }

  async function handleScan(code: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    const { data } = await supabase
      .from('tools')
      .select('id, name')
      .eq('qr_code', code)
      .maybeSingle();
    if (data) await recordTool(data.id, data.name);
    setTimeout(() => {
      busyRef.current = false;
    }, 1200);
  }

  async function finish() {
    if (phase.name !== 'scanning') return;
    const { data, error: rpcError } = await supabase.rpc('close_inventory_session', {
      target_session: phase.sessionId,
      mark_missing_lost: markLost,
    });
    if (rpcError || !data) {
      setError(t('mobile.inventory.failed'));
      return;
    }
    const report = data as { found: number; misplaced: number; missing: number };
    setPhase({ name: 'summary', ...report });
  }

  if (phase.name === 'pick') {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.ink }}
        contentContainerStyle={[ui.screen, { paddingBottom: 48 }]}
      >
        <Text style={ui.brand}>{t('common.appName')}</Text>
        <Text style={ui.title}>{t('mobile.inventory.title')}</Text>
        <Text style={ui.label}>{t('mobile.inventory.pickLocation')}</Text>
        {error ? <Text style={ui.error}>{error}</Text> : null}
        {locations.map((location) => (
          <Pressable
            key={location.id}
            onPress={() => void start(location)}
            style={{
              minHeight: theme.touch.minTarget,
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.lg,
              borderRadius: theme.radius.button,
              borderWidth: 1,
              borderColor: theme.colors.line,
              backgroundColor: theme.colors.panel2,
              marginTop: theme.spacing.sm,
            }}
          >
            <Text style={{ color: theme.colors.paper, fontSize: 16, fontWeight: '600' }}>
              {location.name}
            </Text>
          </Pressable>
        ))}
        <Pressable style={ui.secondaryButton} onPress={onDone}>
          <Text style={ui.secondaryButtonText}>{t('mobile.handover.back')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (phase.name === 'summary') {
    return (
      <View style={[ui.screen, { flex: 1, backgroundColor: theme.colors.ink, justifyContent: 'center' }]}>
        <View style={[ui.stamp, { borderColor: theme.colors.ok }]}>
          <Text style={[ui.stampText, { color: theme.colors.ok }]}>
            {t('mobile.inventory.summaryTitle')}
          </Text>
        </View>
        <Text style={[ui.title, { fontSize: 22 }]}>
          {t('mobile.inventory.summary', {
            found: phase.found,
            misplaced: phase.misplaced,
            missing: phase.missing,
          })}
        </Text>
        <Pressable style={ui.primaryButton} onPress={onDone}>
          <Text style={ui.primaryButtonText}>{t('mobile.handover.backHome')}</Text>
        </Pressable>
      </View>
    );
  }

  const foundCount = [...scanned.values()].filter((value) => value === 'found').length;
  const misplacedCount = scanned.size - foundCount;
  const remaining = [...expected].filter((id) => !scanned.has(id)).length;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.ink }}>
      <View style={{ height: 260 }}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => void handleScan(data)}
        />
      </View>
      <ScrollView contentContainerStyle={[ui.screen, { paddingTop: theme.spacing.lg, paddingBottom: 48 }]}>
        <Text style={ui.mono}>{phase.location.name}</Text>
        <Text style={[ui.value, { marginTop: 4 }]}>{t('mobile.inventory.scanPrompt')}</Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          <View style={[ui.stamp, { marginTop: 0, borderColor: theme.colors.ok }]}>
            <Text style={[ui.stampText, { color: theme.colors.ok }]}>
              {t('mobile.inventory.found', { count: foundCount })}
            </Text>
          </View>
          <View style={[ui.stamp, { marginTop: 0, borderColor: theme.colors.hi }]}>
            <Text style={[ui.stampText, { color: theme.colors.hi }]}>
              {t('mobile.inventory.misplaced', { count: misplacedCount })}
            </Text>
          </View>
          <View style={[ui.stamp, { marginTop: 0, borderColor: theme.colors.hot }]}>
            <Text style={[ui.stampText, { color: theme.colors.hot }]}>
              {t('mobile.inventory.remaining', { count: remaining })}
            </Text>
          </View>
        </View>

        {lastScan ? (
          <View
            style={{
              marginTop: theme.spacing.md,
              borderRadius: theme.radius.button,
              borderWidth: 1,
              borderColor: lastScan.result === 'found' ? theme.colors.ok : theme.colors.hi,
              backgroundColor: theme.colors.panel2,
              padding: theme.spacing.lg,
            }}
          >
            <Text style={{ color: theme.colors.paper, fontSize: 16, fontWeight: '700' }}>
              {lastScan.name}
            </Text>
            <Text
              style={[
                ui.stampText,
                { color: lastScan.result === 'found' ? theme.colors.ok : theme.colors.hi, marginTop: 4 },
              ]}
            >
              {lastScan.result === 'found'
                ? t('mobile.inventory.foundStamp')
                : t('mobile.inventory.misplacedStamp')}
            </Text>
          </View>
        ) : null}

        {showSearch ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <TextInput
              style={ui.input}
              value={query}
              onChangeText={setQuery}
              placeholder={t('mobile.search.placeholder')}
              placeholderTextColor={theme.colors.dim}
              autoFocus
              autoCapitalize="none"
            />
            {results.map((row) => (
              <Pressable
                key={row.id}
                onPress={() => {
                  void recordTool(row.id, row.name);
                  setShowSearch(false);
                  setQuery('');
                }}
                style={{
                  marginTop: theme.spacing.sm,
                  borderRadius: theme.radius.button,
                  borderWidth: 1,
                  borderColor: theme.colors.line,
                  backgroundColor: theme.colors.panel2,
                  padding: theme.spacing.md,
                }}
              >
                <Text style={{ color: theme.colors.paper, fontSize: 15 }}>{row.name}</Text>
                <Text style={[ui.mono, { marginTop: 2 }]}>
                  {[row.qr_code, row.serial_number].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Pressable style={ui.secondaryButton} onPress={() => setShowSearch(true)}>
            <Text style={ui.secondaryButtonText}>{t('mobile.inventory.searchFallback')}</Text>
          </Pressable>
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: theme.spacing.xl,
          }}
        >
          <Text style={{ color: theme.colors.paper, flex: 1, fontSize: 15 }}>
            {t('mobile.inventory.markMissingLost')}
          </Text>
          <Switch
            value={markLost}
            onValueChange={setMarkLost}
            trackColor={{ true: theme.colors.hot, false: theme.colors.line }}
            thumbColor={theme.colors.paper}
          />
        </View>
        {error ? <Text style={ui.error}>{error}</Text> : null}
        <Pressable style={ui.primaryButton} onPress={() => void finish()}>
          <Text style={ui.primaryButtonText}>{t('mobile.inventory.finish')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
