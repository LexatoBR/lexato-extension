/**
 * Sistema de internacionalizacao (i18n) - Extensao Lexato
 *
 * Abordagem leve sem dependencias externas:
 * - React Context + hook useI18n
 * - 3 idiomas: pt-BR (padrao), en, es
 * - Persistencia via localStorage
 * - Preparado para futura persistencia no Supabase (profiles.preferred_locale)
 *
 * @module i18n
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { Locale, Translations } from './types';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from './types';
import { ptBR } from './locales/pt-BR';
import { en } from './locales/en';
import { es } from './locales/es';

/** Mapa de traducoes por locale */
const TRANSLATIONS: Record<Locale, Translations> = {
  'pt-BR': ptBR,
  en,
  es,
};

/** Interface do contexto i18n */
interface I18nContextValue {
  /** Locale atual */
  locale: Locale;
  /** Traducoes do locale atual */
  t: Translations;
  /** Altera o idioma */
  setLocale: (locale: Locale) => void;
}

/** Contexto React */
const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Carrega locale persistido do localStorage
 */
function loadPersistedLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved && (saved === 'pt-BR' || saved === 'en' || saved === 'es')) {
      return saved;
    }
  } catch {
    // localStorage indisponivel
  }
  return DEFAULT_LOCALE;
}

/**
 * Persiste locale no localStorage
 */
function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // localStorage indisponivel
  }
  // TODO: Futuramente persistir no Supabase (profiles.preferred_locale)
  // supabase.from('profiles').update({ preferred_locale: locale }).eq('id', userId)
}

/**
 * Provider do sistema i18n
 * Envolve a aplicacao para fornecer traducoes via contexto
 */
export function I18nProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [locale, setLocaleState] = useState<Locale>(loadPersistedLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    persistLocale(newLocale);
  }, []);

  // Sincroniza com mudancas externas (ex: outra aba)
  useEffect(() => {
    const handleStorage = (e: StorageEvent): void => {
      if (e.key === LOCALE_STORAGE_KEY && e.newValue) {
        const val = e.newValue as Locale;
        if (val === 'pt-BR' || val === 'en' || val === 'es') {
          setLocaleState(val);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    t: TRANSLATIONS[locale],
    setLocale,
  }), [locale, setLocale]);

  return React.createElement(I18nContext.Provider, { value }, children);
}

/**
 * Hook para acessar traducoes e controlar idioma
 *
 * @example
 * const { t, locale, setLocale } = useI18n();
 * return <span>{t.header.credits}</span>;
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('[i18n] useI18n deve ser usado dentro de I18nProvider');
  }
  return ctx;
}

// Re-exportar tipos
export type { Locale, Translations } from './types';
export { LOCALE_LABELS, LOCALE_SHORT, DEFAULT_LOCALE } from './types';
