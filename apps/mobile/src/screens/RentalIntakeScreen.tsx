import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { uploadJpeg } from '../lib/upload';
import { theme, ui } from '../ui';
import { CameraModal } from '../components/CameraModal';

type Vendor = { id: string; name: string; org_id: string };

export function RentalIntakeScreen({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [rate, setRate] = useState('');
  const [due, setDue] = useState('');
  const [hours, setHours] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneQr, setDoneQr] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from('vendors')
      .select('id, name, org_id, type')
      .contains('type', ['rental'])
      .order('name')
      .then(({ data }) => setVendors((data as Vendor[]) ?? []));
  }, []);

  async function submit() {
    if (!vendor || !name.trim() || photos.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const batch = ExpoCrypto.randomUUID();
      const photoItems: { storage_path: string }[] = [];
      for (let i = 0; i < photos.length; i += 1) {
        const path = `${vendor.org_id}/rental-intake/${batch}/${i + 1}.jpg`;
        await uploadJpeg('tool-photos', path, photos[i]);
        photoItems.push({ storage_path: path });
      }
      const { data, error: rpcError } = await supabase.rpc('rental_intake', {
        args: {
          vendor_id: vendor.id,
          name: name.trim(),
          serial_number: serial,
          rental_rate_daily: rate,
          rental_due_return: due.trim(),
          engine_hours: hours,
          photos: photoItems,
        },
      });
      if (rpcError) throw rpcError;
      setDoneQr((data as { qr_code: string }).qr_code);
    } catch {
      setError(t('mobile.rental.failed'));
    } finally {
      setSaving(false);
    }
  }

  if (doneQr) {
    return (
      <View style={[ui.screen, { flex: 1, backgroundColor: theme.colors.ink, justifyContent: 'center' }]}>
        <View style={[ui.stamp, { borderColor: theme.colors.ok }]}>
          <Text style={[ui.stampText, { color: theme.colors.ok }]}>
            {t('mobile.rental.intakeDoneTitle')}
          </Text>
        </View>
        <Text style={[ui.title, { fontSize: 26 }]}>{doneQr}</Text>
        <Text style={[ui.value, { marginTop: 8 }]}>
          {t('mobile.rental.intakeDoneBody', { qr: doneQr })}
        </Text>
        <Pressable style={ui.primaryButton} onPress={onDone}>
          <Text style={ui.primaryButtonText}>{t('mobile.handover.backHome')}</Text>
        </Pressable>
      </View>
    );
  }

  const canSubmit = vendor !== null && name.trim().length > 0 && photos.length > 0 && !saving;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.ink }}
      contentContainerStyle={[ui.screen, { paddingBottom: 48 }]}
    >
      <Text style={ui.brand}>{t('common.appName')}</Text>
      <Text style={ui.title}>{t('mobile.rental.intakeTitle')}</Text>

      <Text style={ui.label}>{t('mobile.rental.vendor')}</Text>
      {vendors.map((v) => (
        <Pressable
          key={v.id}
          onPress={() => setVendor(v)}
          style={{
            minHeight: 44,
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.lg,
            borderRadius: theme.radius.button,
            borderWidth: 1,
            borderColor: vendor?.id === v.id ? theme.colors.hi : theme.colors.line,
            backgroundColor: theme.colors.panel2,
            marginTop: theme.spacing.sm,
          }}
        >
          <Text style={{ color: theme.colors.paper, fontSize: 15, fontWeight: vendor?.id === v.id ? '800' : '400' }}>
            {v.name}
          </Text>
        </Pressable>
      ))}

      <Text style={ui.label}>{t('mobile.rental.name')}</Text>
      <TextInput style={ui.input} value={name} onChangeText={setName} placeholderTextColor={theme.colors.dim} />
      <Text style={ui.label}>{t('mobile.rental.serial')}</Text>
      <TextInput style={ui.input} value={serial} onChangeText={setSerial} autoCapitalize="characters" placeholderTextColor={theme.colors.dim} />
      <Text style={ui.label}>{t('mobile.rental.rate')}</Text>
      <TextInput style={ui.input} value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholderTextColor={theme.colors.dim} />
      <Text style={ui.label}>{t('mobile.rental.due')}</Text>
      <TextInput style={ui.input} value={due} onChangeText={setDue} autoCapitalize="none" placeholderTextColor={theme.colors.dim} />
      <Text style={ui.label}>{t('mobile.rental.hours')}</Text>
      <TextInput style={ui.input} value={hours} onChangeText={setHours} keyboardType="decimal-pad" placeholderTextColor={theme.colors.dim} />

      <Text style={[ui.mono, { marginTop: theme.spacing.lg }]}>{t('mobile.rental.photosHint')}</Text>
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

      {error ? <Text style={ui.error}>{error}</Text> : null}

      <Pressable
        style={[ui.primaryButton, !canSubmit && { opacity: 0.4 }]}
        disabled={!canSubmit}
        onPress={() => void submit()}
      >
        <Text style={ui.primaryButtonText}>{t('mobile.rental.submitIntake')}</Text>
      </Pressable>
      <Pressable style={ui.secondaryButton} onPress={onDone}>
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
