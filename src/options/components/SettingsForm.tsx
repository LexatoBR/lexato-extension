/**
 * Componente de configurações gerais da extensão Lexato
 *
 * Totalmente internacionalizado (pt-BR, en, es).
 * Isolamento obrigatório, geolocalização, notificações, idioma.
 * Salvamento automático via chrome.storage.local.
 *
 * @module SettingsForm
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../../lib/i18n';
import type { Locale } from '../../lib/i18n/types';
import { LOCALE_LABELS } from '../../lib/i18n/types';

/** Configurações da extensão */
interface ExtensionSettings {
  notificationsEnabled: boolean;
  geolocationPreference: 'always' | 'ask' | 'ip_only';
}

const SETTINGS_STORAGE_KEY = 'lexato_settings';

const DEFAULT_SETTINGS: ExtensionSettings = {
  notificationsEnabled: true,
  geolocationPreference: 'ask',
};

export default function SettingsForm(): React.ReactElement {
  const { t, locale, setLocale } = useI18n();
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const result = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
      const saved = result[SETTINGS_STORAGE_KEY] as ExtensionSettings | undefined;
      if (saved) {
        setSettings({ ...DEFAULT_SETTINGS, ...saved });
      }
    } catch (err) {
      console.error('[SettingsForm] Erro ao carregar configurações:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveSettings = useCallback(async (newSettings: ExtensionSettings) => {
    setSaveMessage(null);
    try {
      await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: newSettings });
      setSaveMessage({ type: 'success', text: t.options.settingsSaved });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('[SettingsForm] Erro ao salvar configurações:', err);
      setSaveMessage({ type: 'error', text: t.options.settingsError });
    }
  }, [t]);

  const updateSetting = useCallback(
    <K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) => {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      saveSettings(newSettings);
    },
    [settings, saveSettings]
  );

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const glassStyle: React.CSSProperties = {
    background: 'var(--glass-bg)',
    backdropFilter: 'blur(var(--glass-blur))',
    WebkitBackdropFilter: 'blur(var(--glass-blur))',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--glass-radius)',
  };

  if (isLoading) {
    return (
      <div className="rounded-xl p-6 animate-pulse" style={glassStyle}>
        <div className="h-6 w-48 rounded" style={{ background: 'var(--bg-secondary)' }} />
        <div className="mt-4 space-y-4">
          <div className="h-20 rounded" style={{ background: 'var(--bg-secondary)' }} />
        </div>
      </div>
    );
  }

  const geoOptions: Array<{
    value: ExtensionSettings['geolocationPreference'];
    label: string;
    description: string;
  }> = [
    { value: 'always', label: t.options.geoAlways, description: t.options.geoAlwaysDescription },
    { value: 'ask', label: t.options.geoAsk, description: t.options.geoAskDescription },
    { value: 'ip_only', label: t.options.geoIpOnly, description: t.options.geoIpOnlyDescription },
  ];

  const localeOptions: Locale[] = ['pt-BR', 'en', 'es'];

  return (
    <div className="space-y-6">
      {/* Título da seção */}
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        {t.options.generalSettings}
      </h2>

      {/* Feedback de salvamento */}
      {saveMessage && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            background: saveMessage.type === 'success' ? 'rgba(0, 222, 165, 0.1)' : 'rgba(239, 83, 80, 0.1)',
            color: saveMessage.type === 'success' ? 'var(--green-bright)' : 'var(--color-error)',
            border: `1px solid ${saveMessage.type === 'success' ? 'rgba(0, 222, 165, 0.2)' : 'rgba(239, 83, 80, 0.2)'}`,
          }}
        >
          {saveMessage.text}
        </div>
      )}

      {/* Isolamento de Ambiente */}
      <section className="rounded-xl p-6" style={glassStyle}>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          {t.options.captureSection}
        </h3>

        <div
          className="flex items-start gap-3 rounded-lg p-4"
          style={{ background: 'rgba(0, 222, 165, 0.06)', border: '1px solid rgba(0, 222, 165, 0.2)' }}
        >
          <svg className="h-5 w-5 mt-0.5 shrink-0" style={{ color: 'var(--green-bright)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <div className="flex-1">
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{t.options.environmentIsolation}</span>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{t.options.environmentIsolationDescription}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--sidebar-border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t.options.storageLabel}</p>
            <p className="mt-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.options.storageDuration}</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--sidebar-border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t.options.captureQualityLabel}</p>
            <p className="mt-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.options.captureQualityValue}</p>
          </div>
        </div>
      </section>

      {/* Notificações */}
      <section className="rounded-xl p-6" style={glassStyle}>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          {t.options.notifications}
        </h3>
        <label
          className="flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--sidebar-border)' }}
        >
          <input
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={(e) => updateSetting('notificationsEnabled', e.target.checked)}
            className="h-4 w-4 rounded"
            style={{ accentColor: 'var(--green-bright)' }}
          />
          <div className="flex-1">
            <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{t.options.enableNotifications}</span>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{t.options.enableNotificationsDescription}</p>
          </div>
        </label>
      </section>

      {/* Geolocalização */}
      <section className="rounded-xl p-6" style={glassStyle}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg" style={{ background: 'rgba(0, 222, 165, 0.15)' }}>
            <svg className="w-5 h-5" style={{ color: 'var(--green-bright)' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{t.options.geolocation}</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.options.geolocationDescription}</p>
          </div>
        </div>

        <div className="space-y-2">
          {geoOptions.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors"
              style={{
                background: settings.geolocationPreference === option.value ? 'rgba(0, 222, 165, 0.06)' : 'var(--bg-secondary)',
                border: settings.geolocationPreference === option.value ? '1px solid rgba(0, 222, 165, 0.25)' : '1px solid var(--sidebar-border)',
              }}
            >
              <input
                type="radio"
                name="geolocation"
                value={option.value}
                checked={settings.geolocationPreference === option.value}
                onChange={() => updateSetting('geolocationPreference', option.value)}
                className="mt-1 h-4 w-4"
                style={{ accentColor: 'var(--green-bright)' }}
              />
              <div className="flex-1">
                <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{option.label}</span>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{option.description}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-lg" style={{ background: 'rgba(0, 153, 120, 0.06)', border: '1px solid rgba(0, 153, 120, 0.15)' }}>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--green-mid)' }}>Tip:</strong> {t.options.geoTip}
          </p>
        </div>
      </section>

      {/* Idioma */}
      <section className="rounded-xl p-6" style={glassStyle}>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          {t.options.languageSection}
        </h3>
        <div className="space-y-2">
          {localeOptions.map((loc) => (
            <label
              key={loc}
              className="flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors"
              style={{
                background: locale === loc ? 'rgba(0, 222, 165, 0.06)' : 'var(--bg-secondary)',
                border: locale === loc ? '1px solid rgba(0, 222, 165, 0.25)' : '1px solid var(--sidebar-border)',
              }}
            >
              <input
                type="radio"
                name="locale"
                value={loc}
                checked={locale === loc}
                onChange={() => setLocale(loc)}
                className="h-4 w-4"
                style={{ accentColor: 'var(--green-bright)' }}
              />
              <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{LOCALE_LABELS[loc]}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
