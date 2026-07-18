import { useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { theme, ui } from '../ui';

/** Full-screen capture used for per-component condition photos. */
export function CameraModal({
  visible,
  onCapture,
  onCancel,
}: {
  visible: boolean;
  onCapture: (uri: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);

  async function capture() {
    if (busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.5 });
      if (photo?.uri) onCapture(photo.uri);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: theme.colors.ink }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
        <View
          style={{
            flexDirection: 'row',
            gap: theme.spacing.md,
            padding: theme.spacing.xl,
            backgroundColor: theme.colors.ink,
          }}
        >
          <Pressable style={[ui.secondaryButton, { flex: 1, marginTop: 0 }]} onPress={onCancel}>
            <Text style={ui.secondaryButtonText}>{t('mobile.handover.captureCancel')}</Text>
          </Pressable>
          <Pressable
            style={[ui.primaryButton, { flex: 2, marginTop: 0 }, busy && { opacity: 0.5 }]}
            onPress={() => void capture()}
            disabled={busy}
          >
            <Text style={ui.primaryButtonText}>{t('mobile.handover.takePhoto')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
