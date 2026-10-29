/**
 * Panel copy in the language the app is set to.
 *
 * The Harness owns locale preference (`ctx.locale` -> getLocale/subscribe); this
 * module turns the active locale id into an i18next language, and i18next does
 * lookup, interpolation and re-rendering through react-i18next. Language is not
 * decided here: switching it in the app changes the panel too.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { LocaleService } from '../types/dsh';
import en from './i18n/en.json';
import zh from './i18n/zh.json';

let started = false;

function pick(active: string): 'zh' | 'en' {
  return active.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function setupLocale(service: LocaleService): void {
  if (!started) {
    started = true;
    void i18n.use(initReactI18next).init({
      resources: { zh: { translation: zh }, en: { translation: en } },
      initAsync: false,
      lng: pick(service.getLocale().active),
      fallbackLng: 'en',
      // Keys are literal sentences with dots ("gallery.new"), not nesting paths.
      keySeparator: false,
      nsSeparator: false,
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  }
  const apply = (): void => {
    void i18n.changeLanguage(pick(service.getLocale().active));
  };
  apply();
  service.subscribe(apply);
}
