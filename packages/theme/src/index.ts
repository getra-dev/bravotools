import tokens from './tokens.json';

export { tokens };

export type ColorToken = keyof typeof tokens.color;

/**
 * React Native theme object (mobile app is dark-only — ink background).
 * Components consume these values via ThemeContext, never raw hex.
 */
export const rnTheme = {
  colors: tokens.color,
  radius: tokens.radius,
  spacing: tokens.spacing,
  typography: tokens.typography,
  touch: tokens.touch,
  motion: tokens.motion,
} as const;

export type RNTheme = typeof rnTheme;
