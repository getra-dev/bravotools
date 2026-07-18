import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, messages } from '@bravotools/i18n';

// Session 0: fixed default locale. Later: resolved from profiles.locale.
export default getRequestConfig(async () => ({
  locale: defaultLocale,
  messages: messages[defaultLocale],
}));
