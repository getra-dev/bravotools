import en from './en.json';
import lt from './lt.json';

export const messages = { en, lt } as const;

export type Locale = keyof typeof messages;
export type Messages = typeof en;

export const defaultLocale: Locale = 'en';
export const locales = Object.keys(messages) as Locale[];
