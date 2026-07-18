import { StyleSheet } from 'react-native';
import { rnTheme } from '@bravotools/theme';

const { colors, radius, spacing, typography, touch } = rnTheme;

export const theme = rnTheme;

// Shared building blocks for the dark field app (Industrial Precision).
export const ui = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
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
    fontSize: 28,
    letterSpacing: typography.display.letterSpacing,
    marginTop: spacing.md,
  },
  label: {
    color: colors.dim,
    fontFamily: typography.mono.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: typography.mono.letterSpacing,
    fontSize: 11,
    marginTop: spacing.lg,
  },
  value: {
    color: colors.paper,
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  input: {
    marginTop: spacing.xs,
    minHeight: touch.minTarget,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    color: colors.paper,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
  },
  primaryButton: {
    minHeight: touch.minTarget,
    borderRadius: radius.buttonLg,
    backgroundColor: colors.hi,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
  },
  primaryButtonText: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: touch.minTarget,
    borderRadius: radius.buttonLg,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  secondaryButtonText: {
    color: colors.paper,
    fontWeight: '600',
    fontSize: 15,
  },
  stamp: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.stamp,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  stampText: {
    fontFamily: typography.mono.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: typography.mono.letterSpacing,
    fontSize: 11,
    fontWeight: '600',
  },
  error: {
    color: colors.hot,
    marginTop: spacing.md,
    fontSize: 14,
  },
  mono: {
    color: colors.steel,
    fontFamily: typography.mono.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: typography.mono.letterSpacing,
    fontSize: 12,
  },
});
