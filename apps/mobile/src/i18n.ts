import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { defaultLocale, messages } from '@bravotools/i18n';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: messages.en },
    lt: { translation: messages.lt },
  },
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  // single braces to match next-intl ICU params in the shared en/lt files
  interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
});

export default i18n;
