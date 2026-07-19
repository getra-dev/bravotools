import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { uploadJpeg } from '../lib/upload';
import { theme, ui } from '../ui';
import { CameraModal } from '../components/CameraModal';
import type { IncomingOrder } from '../types';

const ISSUE_TYPES = [
  'short_qty',
  'over_qty',
  'wrong_item',
  'damaged',
  'quality',
  'not_delivered',
] as const;

const CARET = '▼';

type LineState = {
  received: string;
  issueType: string | null;
  issueNote: string;
  photo: string | null;
};

const card = {
  backgroundColor: theme.colors.panel,
  borderRadius: theme.radius.card,
  borderWidth: 1,
  borderColor: theme.colors.line,
  padding: theme.spacing.lg,
} as const;

export function ReceiveOrderScreen({
  order,
  onDone,
  onCancel,
}: {
  order: IncomingOrder;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  const openItems = useMemo(
    () =>
      order.items
        .map((item) => ({
          ...item,
          remaining: Math.max(item.quantity - (item.delivered_quantity ?? 0), 0),
        }))
        .filter((item) => item.remaining > 0),
    [order],
  );

  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      openItems.map((item) => [
        item.id,
        { received: String(item.remaining), issueType: null, issueNote: '', photo: null },
      ]),
    ),
  );
  const [issuePickerFor, setIssuePickerFor] = useState<string | null>(null);
  const [cameraFor, setCameraFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneStatus, setDoneStatus] = useState<string | null>(null);

  function setLine(id: string, patch: Partial<LineState>) {
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const batch = ExpoCrypto.randomUUID();
      const payload = [];
      for (const item of openItems) {
        const line = lines[item.id];
        const received = Number(line.received.replace(',', '.') || '0');
        let photoPath: string | null = null;
        if (line.photo) {
          photoPath = `${order.org_id}/delivery-issues/${batch}/${item.id}.jpg`;
          await uploadJpeg('tool-photos', photoPath, line.photo);
        }
        // exception-first: an unexplained shortfall is a short_qty issue
        const shortfall = item.remaining - received;
        const issueType = line.issueType ?? (shortfall > 0 ? 'short_qty' : null);
        payload.push({
          item_id: item.id,
          received_qty: line.received,
          issue_type: issueType,
          issue_qty: issueType ? String(shortfall > 0 ? shortfall : received) : null,
          issue_note: line.issueNote || null,
          photo_path: photoPath,
        });
      }
      const { data, error: rpcError } = await supabase.rpc('receive_order', {
        args: { order_id: order.id, lines: payload },
      });
      if (rpcError) throw rpcError;
      setDoneStatus((data as { status: string }).status);
    } catch {
      setError(t('mobile.receiving.failed'));
    } finally {
      setSaving(false);
    }
  }

  if (doneStatus) {
    return (
      <View style={[ui.screen, { flex: 1, justifyContent: 'center' }]}>
        <View style={[ui.stamp, { borderColor: theme.colors.ok }]}>
          <Text style={[ui.stampText, { color: theme.colors.ok }]}>
            {t('mobile.receiving.doneTitle')}
          </Text>
        </View>
        <Text style={[ui.title, { fontSize: 24 }]}>{order.order_number}</Text>
        <Text style={[ui.value, { marginTop: 8 }]}>
          {t(`mobile.requests.status.${doneStatus === 'delivered' ? 'delivered' : 'ordered'}`)}
          {doneStatus === 'partially_delivered'
            ? ` — ${t('mobile.receiving.partialHint')}`
            : ''}
        </Text>
        <Pressable style={ui.primaryButton} onPress={onDone}>
          <Text style={ui.primaryButtonText}>{t('mobile.handover.backHome')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.ink }}
      contentContainerStyle={[ui.screen, { paddingBottom: 140 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={ui.brand}>{t('common.appName')}</Text>
      <Text style={ui.title}>{t('mobile.receiving.title')}</Text>
      <Text style={[ui.mono, { marginTop: 4 }]}>
        {order.order_number} · {order.site?.name ?? ''}
      </Text>
      <Text style={[ui.value, { marginTop: theme.spacing.md, color: theme.colors.steel }]}>
        {t('mobile.receiving.hint')}
      </Text>

      {openItems.map((item) => {
        const line = lines[item.id];
        const received = Number(line.received.replace(',', '.') || '0');
        const shortfall = item.remaining - received;
        return (
          <View key={item.id} style={[card, { marginTop: theme.spacing.md }]}>
            <Text style={[ui.value, { marginTop: 0 }]}>{item.description}</Text>
            <Text style={ui.mono}>
              {t('mobile.receiving.expected', {
                qty: item.remaining,
                unit: item.unit ?? '',
              })}
            </Text>

            <Text style={ui.label}>{t('mobile.receiving.received')}</Text>
            <TextInput
              style={ui.input}
              value={line.received}
              onChangeText={(received_) => setLine(item.id, { received: received_ })}
              keyboardType="decimal-pad"
              placeholderTextColor={theme.colors.dim}
            />

            {shortfall > 0 || line.issueType ? (
              <View>
                <Text style={[ui.label, { color: theme.colors.hot }]}>
                  {t('mobile.receiving.issue')}
                </Text>
                <Pressable
                  style={{
                    minHeight: 44,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: theme.spacing.lg,
                    borderRadius: theme.radius.button,
                    borderWidth: 1,
                    borderColor: theme.colors.hot,
                    backgroundColor: theme.colors.panel2,
                    marginTop: theme.spacing.xs,
                  }}
                  onPress={() => setIssuePickerFor(item.id)}
                >
                  <Text style={{ flex: 1, color: theme.colors.paper, fontSize: 15, fontWeight: '700' }}>
                    {t(`mobile.receiving.issueTypes.${line.issueType ?? 'short_qty'}`)}
                  </Text>
                  <Text style={{ color: theme.colors.dim, fontSize: 12 }}>{CARET}</Text>
                </Pressable>
                <TextInput
                  style={ui.input}
                  value={line.issueNote}
                  onChangeText={(issueNote) => setLine(item.id, { issueNote })}
                  placeholder={t('mobile.receiving.notePlaceholder')}
                  placeholderTextColor={theme.colors.dim}
                />
                {line.photo ? (
                  <Pressable onPress={() => setLine(item.id, { photo: null })}>
                    <Image
                      source={{ uri: line.photo }}
                      style={{ width: 72, height: 72, borderRadius: theme.radius.buttonSm, marginTop: theme.spacing.sm }}
                    />
                  </Pressable>
                ) : (
                  <Pressable
                    style={[ui.secondaryButton, { marginTop: theme.spacing.sm }]}
                    onPress={() => setCameraFor(item.id)}
                  >
                    <Text style={ui.secondaryButtonText}>{t('mobile.receiving.addPhoto')}</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>
        );
      })}

      {error ? <Text style={ui.error}>{error}</Text> : null}

      <Pressable
        style={[ui.primaryButton, saving && { opacity: 0.4 }]}
        disabled={saving}
        onPress={() => void submit()}
      >
        <Text style={ui.primaryButtonText}>{t('mobile.receiving.submit')}</Text>
      </Pressable>
      <Pressable style={ui.secondaryButton} onPress={onCancel}>
        <Text style={ui.secondaryButtonText}>{t('mobile.handover.back')}</Text>
      </Pressable>

      <Modal visible={issuePickerFor !== null} transparent animationType="fade">
        <Pressable
          style={{ flex: 1, backgroundColor: theme.colors.scrim, justifyContent: 'center', padding: 24 }}
          onPress={() => setIssuePickerFor(null)}
        >
          <View style={card}>
            <Text style={[ui.label, { marginTop: 0 }]}>{t('mobile.receiving.issue')}</Text>
            {ISSUE_TYPES.map((type) => (
              <Pressable
                key={type}
                onPress={() => {
                  if (issuePickerFor) setLine(issuePickerFor, { issueType: type });
                  setIssuePickerFor(null);
                }}
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <Text style={{ color: theme.colors.paper, fontSize: 16 }}>
                  {t(`mobile.receiving.issueTypes.${type}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <CameraModal
        visible={cameraFor !== null}
        onCancel={() => setCameraFor(null)}
        onCapture={(uri) => {
          if (cameraFor) setLine(cameraFor, { photo: uri });
          setCameraFor(null);
        }}
      />
    </ScrollView>
  );
}
