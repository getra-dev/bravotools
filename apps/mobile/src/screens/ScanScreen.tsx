import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { fetchToolByQr } from '../lib/tools';
import { theme, ui } from '../ui';
import type { ScannedTool } from '../types';

export function ScanScreen({
  onTool,
  onUnknown,
  onSearch,
  onBack,
}: {
  onTool: (tool: ScannedTool) => void;
  onUnknown: (code: string) => void;
  onSearch: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [lookupError, setLookupError] = useState(false);
  const busyRef = useRef(false);

  async function handleScan(code: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setLookupError(false);

    const result = await fetchToolByQr(code);
    if (result === 'error') {
      setLookupError(true);
      busyRef.current = false;
      return;
    }
    if (!result) {
      onUnknown(code);
    } else {
      onTool(result);
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
        <Pressable style={ui.secondaryButton} onPress={onSearch}>
          <Text style={ui.secondaryButtonText}>{t('mobile.scan.searchCta')}</Text>
        </Pressable>
        <Pressable style={ui.secondaryButton} onPress={onBack}>
          <Text style={ui.secondaryButtonText}>{t('mobile.handover.back')}</Text>
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
        <View style={{ alignSelf: 'stretch' }}>
          <Pressable style={ui.secondaryButton} onPress={onSearch}>
            <Text style={ui.secondaryButtonText}>{t('mobile.scan.searchCta')}</Text>
          </Pressable>
          <Pressable style={ui.secondaryButton} onPress={onBack}>
            <Text style={ui.secondaryButtonText}>{t('mobile.handover.back')}</Text>
          </Pressable>
        </View>
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
