import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationKO from '../locales/ko/translation.json';
import translationEN from '../locales/en/translation.json';
import translationZH from '../locales/zh/translation.json';
import translationZHHans from '../locales/zh-Hans/translation.json';
import translationZHHant from '../locales/zh-Hant/translation.json';
import translationJA from '../locales/ja/translation.json';
import translationES from '../locales/es/translation.json';
import translationPTBR from '../locales/pt-BR/translation.json';
import translationDE from '../locales/de/translation.json';
import translationFR from '../locales/fr/translation.json';
import translationID from '../locales/id/translation.json';
import translationTH from '../locales/th/translation.json';
import translationVI from '../locales/vi/translation.json';

const resources = {
    ko: { translation: translationKO },
    en: { translation: translationEN },
    zh: { translation: translationZH },
    'zh-Hans': { translation: translationZHHans },
    'zh-Hant': { translation: translationZHHant },
    'zh-CN': { translation: translationZHHans },
    'zh-SG': { translation: translationZHHans },
    'zh-TW': { translation: translationZHHant },
    'zh-HK': { translation: translationZHHant },
    'zh-MO': { translation: translationZHHant },
    ja: { translation: translationJA },
    es: { translation: translationES },
    'pt-BR': { translation: translationPTBR },
    de: { translation: translationDE },
    fr: { translation: translationFR },
    id: { translation: translationID },
    th: { translation: translationTH },
    vi: { translation: translationVI },
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en', // Default to English if unsupported
        supportedLngs: [
            'ko', 'en',
            'zh', 'zh-Hans', 'zh-Hant', 'zh-CN', 'zh-SG', 'zh-TW', 'zh-HK', 'zh-MO',
            'ja', 'es', 'pt-BR', 'de', 'fr', 'id', 'th', 'vi'
        ],
        nonExplicitSupportedLngs: true,
        interpolation: {
            escapeValue: false, // React already escapes values
        },
        detection: {
            order: ['querystring', 'cookie', 'localStorage', 'navigator', 'htmlTag'],
            caches: ['localStorage', 'cookie'],
        },
    });

export default i18n;
