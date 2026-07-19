import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { theme, ui } from '../ui';
import { SignaturePad } from '../components/SignaturePad';
import type { SignatureStrokes } from '../types';

type ActDetail = {
  id: string;
  org_id: string;
  act_number: string;
  action: string;
  toolName: string;
  toolQr: string | null;
  initiatedBy: string;
  initiatedAt: string;
  giverNote: string | null;
  components: { name: string; included: boolean; note: string | null }[];
  photoUrls: string[];
};

function utf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      code = 0x10000 + ((code - 0xd800) << 10) + (text.charCodeAt(i + 1) - 0xdc00);
      i += 1;
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
  }
  return Uint8Array.from(out);
}

export function CountersignScreen({ actId, onDone }: { actId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [act, setAct] = useState<ActDetail | null>(null);
  const [note, setNote] = useState('');
  const [signing, setSigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doneNumber, setDoneNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('handover_acts')
        .select(
          `id, org_id, act_number,
           movement:tool_movements!handover_acts_movement_id_fkey(
             id, action, performed_at, notes,
             performer:profiles!tool_movements_performed_by_fkey(full_name),
             tool:tools(name, qr_code))`,
        )
        .eq('id', actId)
        .maybeSingle();
      if (!data || !data.movement) return;

      const [{ data: comps }, { data: photoRows }] = await Promise.all([
        supabase
          .from('movement_components')
          .select('included, condition_note, component:tool_components(name)')
          .eq('movement_id', data.movement.id),
        supabase
          .from('tool_photos')
          .select('storage_path')
          .eq('movement_id', data.movement.id)
          .limit(4),
      ]);

      const photoUrls: string[] = [];
      for (const row of photoRows ?? []) {
        const { data: signed } = await supabase.storage
          .from('tool-photos')
          .createSignedUrl(row.storage_path, 3600);
        if (signed?.signedUrl) photoUrls.push(signed.signedUrl);
      }

      setAct({
        id: data.id,
        org_id: data.org_id,
        act_number: data.act_number,
        action: data.movement.action,
        toolName: data.movement.tool?.name ?? '',
        toolQr: data.movement.tool?.qr_code ?? null,
        initiatedBy: data.movement.performer?.full_name ?? '',
        initiatedAt: data.movement.performed_at.slice(0, 16).replace('T', ' '),
        giverNote: data.movement.notes,
        components: (comps ?? []).map((c) => ({
          name: c.component?.name ?? '',
          included: c.included,
          note: c.condition_note,
        })),
        photoUrls,
      });
    })();
  }, [actId]);

  async function submit(signature: SignatureStrokes) {
    if (!act) return;
    setSaving(true);
    setError(null);
    try {
      const path = `${act.org_id}/acts/${act.id}/countersign-${ExpoCrypto.randomUUID().slice(0, 8)}.json`;
      const { error: uploadError } = await supabase.storage
        .from('signatures')
        .upload(path, utf8Bytes(JSON.stringify(signature)).buffer as ArrayBuffer, {
          contentType: 'application/json',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data, error: rpcError } = await supabase.rpc('countersign_handover', {
        act_id: act.id,
        signature_path: path,
        note,
      });
      if (rpcError) throw rpcError;
      setDoneNumber((data as { act_number: string }).act_number);
    } catch {
      setError(t('mobile.countersign.failed'));
      setSigning(false);
    } finally {
      setSaving(false);
    }
  }

  if (doneNumber) {
    return (
      <View style={[ui.screen, { justifyContent: 'center', backgroundColor: theme.colors.ink }]}>
        <View style={[ui.stamp, { borderColor: theme.colors.ok }]}>
          <Text style={[ui.stampText, { color: theme.colors.ok }]}>
            {t('mobile.countersign.successTitle')}
          </Text>
        </View>
        <Text style={[ui.title, { fontSize: 24 }]}>{doneNumber}</Text>
        <Pressable style={ui.primaryButton} onPress={onDone}>
          <Text style={ui.primaryButtonText}>{t('mobile.countersign.backToMy')}</Text>
        </Pressable>
      </View>
    );
  }

  if (signing && act) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.ink }}>
        <View style={ui.screen}>
          <Text style={ui.mono}>{act.act_number}</Text>
          <Text style={ui.title}>{t('mobile.countersign.signTitle')}</Text>
          {error ? <Text style={ui.error}>{error}</Text> : null}
          <SignaturePad title={t('mobile.handover.signReceiver')} onDone={(sig) => void submit(sig)} />
          <Pressable style={ui.secondaryButton} onPress={() => setSigning(false)} disabled={saving}>
            <Text style={ui.secondaryButtonText}>{t('mobile.handover.back')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.ink }}
      contentContainerStyle={[ui.screen, { paddingBottom: 48 }]}
    >
      {act ? (
        <>
          <Text style={ui.mono}>{act.act_number}</Text>
          <Text style={ui.title}>{t('mobile.countersign.title')}</Text>
          <Text style={[ui.value, { marginTop: 8 }]}>{act.toolName}</Text>
          <Text style={[ui.mono, { marginTop: 4 }]}>{act.toolQr}</Text>
          <Text style={[ui.mono, { marginTop: 8 }]}>
            {t('mobile.my.initiatedBy', { name: act.initiatedBy, date: act.initiatedAt })}
          </Text>

          {act.giverNote ? (
            <>
              <Text style={ui.label}>{t('mobile.countersign.giverNote')}</Text>
              <Text style={ui.value}>{act.giverNote}</Text>
            </>
          ) : null}

          {act.components.length > 0 ? (
            <>
              <Text style={ui.label}>{t('mobile.countersign.componentsTitle')}</Text>
              {act.components.map((c, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: theme.spacing.sm,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.paper, fontSize: 15 }}>{c.name}</Text>
                    {c.note ? <Text style={[ui.mono, { marginTop: 2 }]}>{c.note}</Text> : null}
                  </View>
                  <View
                    style={[ui.stamp, { marginTop: 0, borderColor: c.included ? theme.colors.ok : theme.colors.hot }]}
                  >
                    <Text style={[ui.stampText, { color: c.included ? theme.colors.ok : theme.colors.hot }]}>
                      {c.included
                        ? t('mobile.countersign.includedStamp')
                        : t('mobile.countersign.missingStamp')}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          ) : null}

          {act.photoUrls.length > 0 ? (
            <>
              <Text style={ui.label}>{t('mobile.countersign.photosTitle')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                {act.photoUrls.map((url) => (
                  <Image
                    key={url}
                    source={{ uri: url }}
                    style={{ width: 84, height: 84, borderRadius: theme.radius.buttonSm }}
                  />
                ))}
              </View>
            </>
          ) : null}

          <Text style={ui.label}>{t('mobile.countersign.yourNote')}</Text>
          <TextInput
            style={ui.input}
            value={note}
            onChangeText={setNote}
            placeholderTextColor={theme.colors.dim}
          />

          {error ? <Text style={ui.error}>{error}</Text> : null}

          <Pressable style={ui.primaryButton} onPress={() => setSigning(true)}>
            <Text style={ui.primaryButtonText}>{t('mobile.my.signAction')}</Text>
          </Pressable>
          <Pressable style={ui.secondaryButton} onPress={onDone}>
            <Text style={ui.secondaryButtonText}>{t('mobile.handover.back')}</Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}
