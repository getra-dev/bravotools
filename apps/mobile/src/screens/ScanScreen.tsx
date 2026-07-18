import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { theme, ui } from '../ui';
import type { ScannedTool } from '../types';

export function ScanScreen({
  onTool,
  onUnknown,
  onSignOut,
}: {
  onTool: (tool: ScannedTool) => void;
  onUnknown: (code: string) => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [lookupError, setLookupError] = useState(false);
  const busyRef = useRef(false);

  async function handleScan(code: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setLookupError(false);

    const { data, error } = await supabase
      .from('tools')
      .select(
        `id, org_id, name, qr_code, status, serial_number, tracks_engine_hours, engine_hours,
         category:tool_categories(name),
         location:locations!tools_current_location_id_fkey(name),
         holder:profiles!tools_current_holder_id_fkey(full_name),
         external_holder:external_persons!tools_current_external_holder_id_fkey(full_name)`,
      )
      .eq('qr_code', code)
      .maybeSingle();

    if (error) {
      setLookupError(true);
      busyRef.current = false;
      return;
    }
    if (!data) {
      onUnknown(code);
    } else {
      onTool(data as ScannedTool);
    }
    // small delay so a lingering frame does not re-trigger instantly
    setTimeout(() => {
      busyRef.current = false;
    }, 1500);
  }

  if (!permission?.granted) {
    return (
      <View style={[ui.screen, { justifyContent: 'center' }]}>
        <Text style={ui.brand}>{t('common.appName')}</Text>
        <Text style={[ui.value, { marginTop: theme.spacing.lg }]}>
          {t('mobile.scan.permissionNeeded')}
        </Text>
        <Pressable style={ui.primaryButton} onPress={requestPermission}>
          <Text style={ui.primaryButtonText}>{t('mobile.scan.grant')}</Text>
        </Pressable>
        <Pressable style={ui.secondaryButton} onPress={onSignOut}>
          <Text style={ui.secondaryButtonText}>{t('mobile.scan.signOut')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.ink }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => void handleScan(data)}
      />
      <View style={styles.overlay}>
        <Text style={ui.brand}>{t('common.appName')}</Text>
        <View style={styles.frame} />
        <Text style={styles.instruction}>
          {lookupError ? t('mobile.scan.lookupFailed') : t('mobile.scan.instruction')}
        </Text>
        <Pressable style={ui.secondaryButton} onPress={onSignOut}>
          <Text style={ui.secondaryButtonText}>{t('mobile.scan.signOut')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.xxl * 2,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.xxl,
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: theme.colors.hi,
    borderRadius: theme.radius.card,
    backgroundColor: 'transparent',
  },
  instruction: {
    color: theme.colors.paper,
    fontSize: 16,
    fontWeight: '600',
  },
});
