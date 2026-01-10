import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationKO from '../locales/ko/translation.json';
import translationEN from '../locales/en/translation.json';
import translationZH from '../locales/zh/translation.json';
import translationJA from '../locales/ja/translation.json';

const resources = {
    ko: { translation: translationKO },
    en: { translation: translationEN },
    zh: { translation: translationZH },
    ja: { translation: translationJA },
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'ko', // Default language
        interpolation: {
            escapeValue: false, // React already escapes values
        },
        detection: {
            order: ['querystring', 'cookie', 'localStorage', 'navigator', 'htmlTag'],
            caches: ['localStorage', 'cookie'],
        },
    });

export default i18n;
