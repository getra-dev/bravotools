import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView } from 'expo-camera';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import * as ExpoCrypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { theme, ui } from '../ui';
import { SignaturePad } from '../components/SignaturePad';
import type {
  ChecklistItem,
  HandoverAction,
  Receiver,
  ScannedTool,
  SignatureStrokes,
} from '../types';

type Step =
  | 'receiver'
  | 'location'
  | 'components'
  | 'photo'
  | 'engine'
  | 'signGiver'
  | 'signReceiver'
  | 'saving'
  | 'done';

type LocationOption = { id: string; name: string };

// Hermes on older RN versions lacks TextEncoder — encode UTF-8 by hand.
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

function stepsFor(action: HandoverAction, tracksEngine: boolean): Step[] {
  const tail: Step[] = tracksEngine
    ? ['photo', 'engine', 'signGiver', 'signReceiver']
    : ['photo', 'signGiver', 'signReceiver'];
  if (action === 'checkin') return ['location', 'components', ...tail];
  return ['receiver', 'components', ...tail];
}

export function HandoverWizard({
  tool,
  action,
  onDone,
  onCancel,
}: {
  tool: ScannedTool;
  action: HandoverAction;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const steps = stepsFor(action, tool.tracks_engine_hours);
  const [stepIndex, setStepIndex] = useState(0);
  const [receiver, setReceiver] = useState<Receiver | null>(null);
  const [toLocation, setToLocation] = useState<LocationOption | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [engineHours, setEngineHours] = useState(String(tool.engine_hours ?? ''));
  const [giverSig, setGiverSig] = useState<SignatureStrokes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actNumber, setActNumber] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const step: Step = actNumber ? 'done' : saving ? 'saving' : steps[stepIndex];
  const title =
    action === 'checkout'
      ? t('mobile.handover.titleCheckout')
      : action === 'checkin'
        ? t('mobile.handover.titleCheckin')
        : t('mobile.handover.titleTransfer');

  useEffect(() => {
    void supabase
      .from('tool_components')
      .select('id, name')
      .eq('tool_id', tool.id)
      .order('created_at')
      .then(({ data }) =>
        setChecklist(
          (data ?? []).map((c) => ({
            component_id: c.id,
            name: c.name,
            included: true,
            condition_note: '',
          })),
        ),
      );
  }, [tool.id]);

  function next() {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }
  function back() {
    if (stepIndex === 0) onCancel();
    else setStepIndex((i) => i - 1);
  }

  async function captureGps(): Promise<{ lat: number | null; lng: number | null }> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return { lat: null, lng: null };
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      if (!pos) return { lat: null, lng: null };
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return { lat: null, lng: null };
    }
  }

  async function uploadBytes(bucket: string, path: string, bytes: Uint8Array, contentType: string) {
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, bytes.buffer as ArrayBuffer, { contentType, upsert: true });
    if (uploadError) throw new Error('upload_failed');
  }

  async function submit(receiverSig: SignatureStrokes) {
    setSaving(true);
    setError(null);
    try {
      const movementId = ExpoCrypto.randomUUID();
      const actId = ExpoCrypto.randomUUID();
      const gps = await captureGps();

      const photoPaths: string[] = [];
      for (let i = 0; i < photos.length; i += 1) {
        const b64 = await FileSystem.readAsStringAsync(photos[i], { encoding: 'base64' });
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const path = `${tool.org_id}/${tool.id}/${movementId}/${i + 1}.jpg`;
        await uploadBytes('tool-photos', path, bytes, 'image/jpeg');
        photoPaths.push(path);
      }

      const giverPath = `${tool.org_id}/acts/${actId}/giver.json`;
      const receiverPath = `${tool.org_id}/acts/${actId}/receiver.json`;
      await uploadBytes('signatures', giverPath, utf8Bytes(JSON.stringify(giverSig)), 'application/json');
      await uploadBytes('signatures', receiverPath, utf8Bytes(JSON.stringify(receiverSig)), 'application/json');

      const { data, error: rpcError } = await supabase.rpc('perform_handover', {
        args: {
          movement_id: movementId,
          act_id: actId,
          tool_id: tool.id,
          action,
          receiver_profile_id: receiver?.kind === 'profile' ? receiver.id : '',
          receiver_external_id: receiver?.kind === 'external' ? receiver.id : '',
          to_location_id: toLocation?.id ?? '',
          engine_hours: tool.tracks_engine_hours ? engineHours.replace(',', '.') : '',
          gps_lat: gps.lat === null ? '' : String(gps.lat),
          gps_lng: gps.lng === null ? '' : String(gps.lng),
          components: checklist.map((c) => ({
            component_id: c.component_id,
            included: c.included,
            condition_note: c.condition_note,
          })),
          photos: photoPaths.map((p) => ({ storage_path: p })),
          giver_signature_path: giverPath,
          receiver_signature_path: receiverPath,
          performed_at: new Date().toISOString(),
        },
      });
      if (rpcError) throw rpcError;
      setActNumber((data as { act_number: string }).act_number);
    } catch {
      setError(t('mobile.handover.failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.ink }}>
      <ScrollView contentContainerStyle={[ui.screen, { paddingBottom: 48 }]}>
        <Text style={ui.mono}>{tool.qr_code}</Text>
        <Text style={ui.title}>{title}</Text>
        <Text style={[ui.mono, { marginTop: 4 }]}>{tool.name}</Text>
        {error ? <Text style={ui.error}>{error}</Text> : null}

        {step === 'receiver' ? (
          <ReceiverStep tool={tool} selected={receiver} onSelect={setReceiver} onNext={next} />
        ) : null}
        {step === 'location' ? (
          <LocationStep
            orgId={tool.org_id}
            selected={toLocation}
            onSelect={setToLocation}
            onNext={next}
          />
        ) : null}
        {step === 'components' ? (
          <ComponentsStep checklist={checklist} onChange={setChecklist} onNext={next} />
        ) : null}
        {step === 'photo' ? (
          <PhotoStep photos={photos} onChange={setPhotos} onNext={next} />
        ) : null}
        {step === 'engine' ? (
          <View>
            <Text style={ui.label}>{t('mobile.handover.engineTitle')}</Text>
            <Text style={[ui.mono, { marginTop: 4 }]}>{t('mobile.handover.engineHint')}</Text>
            <TextInput
              style={ui.input}
              value={engineHours}
              onChangeText={setEngineHours}
              keyboardType="decimal-pad"
              placeholderTextColor={theme.colors.dim}
            />
            <Pressable style={ui.primaryButton} onPress={next}>
              <Text style={ui.primaryButtonText}>{t('mobile.handover.next')}</Text>
            </Pressable>
          </View>
        ) : null}
        {step === 'signGiver' ? (
          <SignaturePad
            title={t('mobile.handover.signGiver')}
            onDone={(sig) => {
              setGiverSig(sig);
              next();
            }}
          />
        ) : null}
        {step === 'signReceiver' ? (
          <SignaturePad title={t('mobile.handover.signReceiver')} onDone={(sig) => void submit(sig)} />
        ) : null}
        {step === 'saving' ? (
          <View style={{ marginTop: 48, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.hi} size="large" />
            <Text style={[ui.value, { marginTop: 16 }]}>{t('mobile.handover.saving')}</Text>
          </View>
        ) : null}
        {step === 'done' && actNumber ? (
          <View style={{ marginTop: 32 }}>
            <View style={[ui.stamp, { borderColor: theme.colors.ok }]}>
              <Text style={[ui.stampText, { color: theme.colors.ok }]}>
                {t('mobile.handover.successTitle')}
              </Text>
            </View>
            <Text style={[ui.title, { fontSize: 22 }]}>{actNumber}</Text>
            <Text style={[ui.value, { marginTop: 8 }]}>
              {t('mobile.handover.successBody', { act: actNumber })}
            </Text>
            <Pressable style={ui.primaryButton} onPress={onDone}>
              <Text style={ui.primaryButtonText}>{t('mobile.handover.scanNext')}</Text>
            </Pressable>
          </View>
        ) : null}

        {step !== 'done' && step !== 'saving' ? (
          <Pressable style={ui.secondaryButton} onPress={back}>
            <Text style={ui.secondaryButtonText}>{t('mobile.handover.back')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ---------- steps ----------

function ReceiverStep({
  tool,
  selected,
  onSelect,
  onNext,
}: {
  tool: ScannedTool;
  selected: Receiver | null;
  onSelect: (r: Receiver) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<Receiver[]>([]);
  const [externals, setExternals] = useState<Receiver[]>([]);
  const [showNewExternal, setShowNewExternal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPosition, setNewPosition] = useState('');

  useEffect(() => {
    void supabase
      .from('memberships')
      .select('user_id, profiles(full_name)')
      .eq('org_id', tool.org_id)
      .then(({ data }) =>
        setMembers(
          (data ?? [])
            .filter((m) => m.profiles?.full_name)
            .map((m) => ({ kind: 'profile', id: m.user_id, name: m.profiles!.full_name! })),
        ),
      );
    void supabase
      .from('external_persons')
      .select('id, full_name')
      .eq('org_id', tool.org_id)
      .eq('is_active', true)
      .then(({ data }) =>
        setExternals(
          (data ?? []).map((e) => ({ kind: 'external', id: e.id, name: e.full_name })),
        ),
      );
  }, [tool.org_id]);

  async function createExternal() {
    const { data, error } = await supabase.rpc('create_external_person', {
      target_org: tool.org_id,
      person_name: newName,
      person_phone: newPhone,
      person_position: newPosition,
    });
    if (!error && data) {
      const created: Receiver = { kind: 'external', id: data, name: newName.trim() };
      setExternals((prev) => [...prev, created]);
      onSelect(created);
      setShowNewExternal(false);
    }
  }

  function Row({ person }: { person: Receiver }) {
    const active = selected?.id === person.id;
    return (
      <Pressable
        onPress={() => onSelect(person)}
        style={{
          minHeight: theme.touch.minTarget,
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.button,
          borderWidth: 1,
          borderColor: active ? theme.colors.hi : theme.colors.line,
          backgroundColor: active ? theme.colors.panel : theme.colors.panel2,
          marginTop: theme.spacing.sm,
        }}
      >
        <Text style={{ color: theme.colors.paper, fontSize: 16, fontWeight: active ? '800' : '400' }}>
          {person.name}
        </Text>
      </Pressable>
    );
  }

  return (
    <View>
      <Text style={ui.label}>{t('mobile.handover.receiverTitle')}</Text>
      <Text style={[ui.mono, { marginTop: 12 }]}>{t('mobile.handover.membersSection')}</Text>
      {members.map((m) => (
        <Row key={m.id} person={m} />
      ))}
      <Text style={[ui.mono, { marginTop: 16 }]}>{t('mobile.handover.externalSection')}</Text>
      {externals.map((e) => (
        <Row key={e.id} person={e} />
      ))}

      {showNewExternal ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <Text style={ui.label}>{t('mobile.handover.externalName')}</Text>
          <TextInput style={ui.input} value={newName} onChangeText={setNewName} />
          <Text style={ui.label}>{t('mobile.handover.externalPhone')}</Text>
          <TextInput style={ui.input} value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
          <Text style={ui.label}>{t('mobile.handover.externalPosition')}</Text>
          <TextInput style={ui.input} value={newPosition} onChangeText={setNewPosition} />
          <Pressable
            style={[ui.secondaryButton, newName.trim() === '' && { opacity: 0.4 }]}
            disabled={newName.trim() === ''}
            onPress={() => void createExternal()}
          >
            <Text style={ui.secondaryButtonText}>{t('mobile.handover.externalCreate')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={ui.secondaryButton} onPress={() => setShowNewExternal(true)}>
          <Text style={ui.secondaryButtonText}>{t('mobile.handover.newExternal')}</Text>
        </Pressable>
      )}

      <Pressable
        style={[ui.primaryButton, !selected && { opacity: 0.4 }]}
        disabled={!selected}
        onPress={onNext}
      >
        <Text style={ui.primaryButtonText}>{t('mobile.handover.next')}</Text>
      </Pressable>
    </View>
  );
}

function LocationStep({
  orgId,
  selected,
  onSelect,
  onNext,
}: {
  orgId: string;
  selected: LocationOption | null;
  onSelect: (l: LocationOption) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const [locations, setLocations] = useState<LocationOption[]>([]);

  useEffect(() => {
    void supabase
      .from('locations')
      .select('id, name, type')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .in('type', ['site', 'warehouse'])
      .order('type')
      .then(({ data }) => {
        const list = data ?? [];
        setLocations(list.map((l) => ({ id: l.id, name: l.name })));
        const warehouse = list.find((l) => l.type === 'warehouse');
        if (warehouse) onSelect({ id: warehouse.id, name: warehouse.name });
      });
  }, [orgId]);

  return (
    <View>
      <Text style={ui.label}>{t('mobile.handover.returnLocationTitle')}</Text>
      {locations.map((l) => {
        const active = selected?.id === l.id;
        return (
          <Pressable
            key={l.id}
            onPress={() => onSelect(l)}
            style={{
              minHeight: theme.touch.minTarget,
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.lg,
              borderRadius: theme.radius.button,
              borderWidth: 1,
              borderColor: active ? theme.colors.hi : theme.colors.line,
              backgroundColor: active ? theme.colors.panel : theme.colors.panel2,
              marginTop: theme.spacing.sm,
            }}
          >
            <Text style={{ color: theme.colors.paper, fontSize: 16, fontWeight: active ? '800' : '400' }}>
              {l.name}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        style={[ui.primaryButton, !selected && { opacity: 0.4 }]}
        disabled={!selected}
        onPress={onNext}
      >
        <Text style={ui.primaryButtonText}>{t('mobile.handover.next')}</Text>
      </Pressable>
    </View>
  );
}

function ComponentsStep({
  checklist,
  onChange,
  onNext,
}: {
  checklist: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View>
      <Text style={ui.label}>{t('mobile.handover.componentsTitle')}</Text>
      {checklist.map((item, index) => (
        <View
          key={item.component_id}
          style={{
            marginTop: theme.spacing.sm,
            borderRadius: theme.radius.button,
            borderWidth: 1,
            borderColor: theme.colors.line,
            backgroundColor: theme.colors.panel2,
            padding: theme.spacing.lg,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.colors.paper, fontSize: 16, flex: 1 }}>{item.name}</Text>
            <Switch
              value={item.included}
              onValueChange={(value) => {
                const nextItems = [...checklist];
                nextItems[index] = { ...item, included: value };
                onChange(nextItems);
              }}
              trackColor={{ true: theme.colors.ok, false: theme.colors.line }}
              thumbColor={theme.colors.paper}
            />
          </View>
          {!item.included ? (
            <TextInput
              style={[ui.input, { marginTop: theme.spacing.sm }]}
              placeholder={t('mobile.handover.componentNote')}
              placeholderTextColor={theme.colors.dim}
              value={item.condition_note}
              onChangeText={(text) => {
                const nextItems = [...checklist];
                nextItems[index] = { ...item, condition_note: text };
                onChange(nextItems);
              }}
            />
          ) : null}
        </View>
      ))}
      <Pressable style={ui.primaryButton} onPress={onNext}>
        <Text style={ui.primaryButtonText}>{t('mobile.handover.next')}</Text>
      </Pressable>
    </View>
  );
}

function PhotoStep({
  photos,
  onChange,
  onNext,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);

  async function capture() {
    if (busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.5 });
      if (photo?.uri) onChange([...photos, photo.uri]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text style={ui.label}>{t('mobile.handover.photoTitle')}</Text>
      <Text style={[ui.mono, { marginTop: 4 }]}>{t('mobile.handover.photoHint')}</Text>
      <View
        style={{
          height: 280,
          marginTop: theme.spacing.md,
          borderRadius: theme.radius.card,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.colors.line,
        }}
      >
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
      </View>
      <Pressable style={ui.primaryButton} onPress={() => void capture()}>
        <Text style={ui.primaryButtonText}>{t('mobile.handover.takePhoto')}</Text>
      </Pressable>
      {photos.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          {photos.map((uri) => (
            <Pressable key={uri} onPress={() => onChange(photos.filter((p) => p !== uri))}>
              <Image
                source={{ uri }}
                style={{ width: 72, height: 72, borderRadius: theme.radius.buttonSm }}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={[ui.mono, { marginTop: theme.spacing.sm }]}>
        {t('mobile.handover.photoCount', { count: photos.length })}
      </Text>
      <Pressable
        style={[ui.secondaryButton, photos.length === 0 && { opacity: 0.4 }]}
        disabled={photos.length === 0}
        onPress={onNext}
      >
        <Text style={ui.secondaryButtonText}>{t('mobile.handover.next')}</Text>
      </Pressable>
    </View>
  );
}
