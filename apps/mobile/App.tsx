import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { rnTheme } from '@bravotools/theme';
import './src/i18n';

const { colors, radius, spacing, typography } = rnTheme;

export default function App() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>{t('common.appName')}</Text>
      <Text style={styles.title}>{t('mobile.home.title')}</Text>
      <Text style={styles.subtitle}>{t('mobile.home.subtitle')}</Text>
      <View style={styles.stamp}>
        <Text style={styles.stampText}>{t('mobile.home.statusReady')}</Text>
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  brand: {
    color: colors.hi,
    fontFamily: typography.mono.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: typography.mono.letterSpacing,
    fontSize: 13,
  },
  title: {
    color: colors.paper,
    fontWeight: '800',
    fontSize: 32,
    letterSpacing: typography.display.letterSpacing,
    marginTop: spacing.md,
  },
  subtitle: {
    color: colors.steel,
    fontSize: 15,
    marginTop: spacing.sm,
  },
  stamp: {
    borderWidth: 1,
    borderColor: colors.ok,
    borderRadius: radius.stamp,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xl,
  },
  stampText: {
    color: colors.ok,
    textTransform: 'uppercase',
    letterSpacing: typography.mono.letterSpacing,
    fontSize: 11,
    fontWeight: '600',
  },
});
