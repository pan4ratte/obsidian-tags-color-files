import { moment } from 'obsidian';
import en from './locales/en';
import ru from './locales/ru'; // Import other languages here

// Define a type for the locale data to avoid using 'any'
type LocaleData = Record<string, string>;

const localeMap: Record<string, LocaleData> = {
    en,
    ru,
    // Add other mappings here
};

export const t = (key: string): string => {
    // moment.locale() returns 'en', 'ru', 'zh-cn', etc.
    const lang = moment.locale();
    const targetLocale = localeMap[lang] || localeMap['en'];
    
    return targetLocale[key] || localeMap['en'][key] || key;
};