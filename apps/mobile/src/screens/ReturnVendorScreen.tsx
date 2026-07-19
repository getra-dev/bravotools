import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { uploadJpeg } from '../lib/upload';
import { theme, ui } from '../ui';
import { CameraModal } from '../components/CameraModal';
import type { ScannedTool } from '../types';

export function ReturnVendorScreen({
  tool,
  onDone,
  onCancel,
}: {
  tool: ScannedTool;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<string[]>([]);
  const [hours, setHours] = useState(String(tool.engine_hours ?? ''));
  const [note, setNote] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (photos.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const movementId = ExpoCrypto.randomUUID();
      const photoItems: { storage_path: string }[] = [];
      for (let i = 0; i < photos.length; i += 1) {
        const path = `${tool.org_id}/${tool.id}/${movementId}/${i + 1}.jpg`;
        await uploadJpeg('tool-photos', path, photos[i]);
        photoItems.push({ storage_path: path });
      }
      const { error: rpcError } = await supabase.rpc('return_to_vendor', {
        args: {
          movement_id: movementId,
          tool_id: tool.id,
          engine_hours: tool.tracks_engine_hours ? hours : '',
          note,
          photos: photoItems,
        },
      });
      if (rpcError) throw rpcError;
      setDone(true);
    } catch {
      setError(t('mobile.rental.failed'));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <View style={[ui.screen, { flex: 1, backgroundColor: theme.colors.ink, justifyContent: 'center' }]}>
        <View style={[ui.stamp, { borderColor: theme.colors.ok }]}>
          <Text style={[ui.stampText, { color: theme.colors.ok }]}>
            {t('mobile.rental.returnDoneTitle')}
          </Text>
        </View>
        <Text style={[ui.value, { marginTop: 12 }]}>{t('mobile.rental.returnDoneBody')}</Text>
        <Pressable style={ui.primaryButton} onPress={onDone}>
          <Text style={ui.primaryButtonText}>{t('mobile.handover.backHome')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.ink }}
      contentContainerStyle={[ui.screen, { paddingBottom: 48 }]}
    >
      <Text style={ui.mono}>{tool.qr_code}</Text>
      <Text style={ui.title}>{t('mobile.rental.returnTitle')}</Text>
      <Text style={[ui.mono, { marginTop: 4 }]}>{tool.name}</Text>

      <Text style={[ui.mono, { marginTop: theme.spacing.lg }]}>
        {t('mobile.rental.returnPhotosHint')}
      </Text>
      <Pressable style={ui.secondaryButton} onPress={() => setCameraOpen(true)}>
        <Text style={ui.secondaryButtonText}>{t('mobile.rental.takePhoto')}</Text>
      </Pressable>
      {photos.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
          {photos.map((uri) => (
            <Pressable key={uri} onPress={() => setPhotos(photos.filter((p) => p !== uri))}>
              <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: theme.radius.buttonSm }} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={[ui.mono, { marginTop: 4 }]}>
        {t('mobile.rental.photoCount', { count: photos.length })}
      </Text>

      {tool.tracks_engine_hours ? (
        <>
          <Text style={ui.label}>{t('mobile.rental.returnHours')}</Text>
          <TextInput
            style={ui.input}
            value={hours}
            onChangeText={setHours}
            keyboardType="decimal-pad"
            placeholderTextColor={theme.colors.dim}
          />
        </>
      ) : null}

      <Text style={ui.label}>{t('mobile.rental.note')}</Text>
      <TextInput style={ui.input} value={note} onChangeText={setNote} placeholderTextColor={theme.colors.dim} />

      {error ? <Text style={ui.error}>{error}</Text> : null}

      <Pressable
        style={[ui.primaryButton, (photos.length === 0 || saving) && { opacity: 0.4 }]}
        disabled={photos.length === 0 || saving}
        onPress={() => void submit()}
      >
        <Text style={ui.primaryButtonText}>{t('mobile.rental.submitReturn')}</Text>
      </Pressable>
      <Pressable style={ui.secondaryButton} onPress={onCancel}>
        <Text style={ui.secondaryButtonText}>{t('mobile.handover.back')}</Text>
      </Pressable>

      <CameraModal
        visible={cameraOpen}
        onCancel={() => setCameraOpen(false)}
        onCapture={(uri) => {
          setPhotos((prev) => [...prev, uri]);
          setCameraOpen(false);
        }}
      />
    </ScrollView>
  );
}
