import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ui } from '../ui';

export function UnknownCodeScreen({
  code,
  onScanAgain,
}: {
  code: string;
  onScanAgain: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={[ui.screen, { justifyContent: 'center' }]}>
      <Text style={ui.brand}>{t('common.appName')}</Text>
      <Text style={ui.title}>{t('mobile.unknown.title')}</Text>
      <Text style={[ui.value, { marginTop: 12 }]}>{t('mobile.unknown.body', { code })}</Text>
      <Text style={[ui.mono, { marginTop: 16, textTransform: 'none', letterSpacing: 0 }]}>
        {t('mobile.unknown.hint')}
      </Text>
      <Pressable style={ui.primaryButton} onPress={onScanAgain}>
        <Text style={ui.primaryButtonText}>{t('mobile.unknown.scanAgain')}</Text>
      </Pressable>
    </View>
  );
}
