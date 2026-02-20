/**
 * Página de Opções da Extensão Lexato
 *
 * Layout vertical sem abas: Sobre > Perfil > Configurações Gerais
 * Título com branding Lexato e subtítulo "Ajustes do Complemento"
 * Totalmente internacionalizado (pt-BR, en, es)
 *
 * @module OptionsApp
 */

import React from 'react';
import { useAuth } from '../sidepanel/hooks/useAuth';
import { I18nProvider, useI18n } from '../lib/i18n';
import SettingsForm from './components/SettingsForm';
import AccountInfo from './components/AccountInfo';
import AboutSection from './components/AboutSection';
import lexatoLogo from '../assets/branding/icon-48.webp';

/**
 * Conteúdo principal (dentro do I18nProvider)
 */
function OptionsContent(): React.ReactElement {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const { t } = useI18n();

  if (isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--green-bright)', borderTopColor: 'transparent' }}
          />
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {t.common.loading}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      {/* Header com branding Lexato */}
      <header
        className="px-8 py-6"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
          borderBottom: '1px solid var(--sidebar-border)',
        }}
      >
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-4">
            <img src={lexatoLogo} alt="Lexato" className="h-12 w-12 rounded-xl" />
            <div>
              <h1
                className="text-2xl font-bold"
                style={{
                  background: 'linear-gradient(90deg, var(--green-bright), var(--green-mid))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Lexato
              </h1>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>
                {t.options.subtitle}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Aviso se não autenticado */}
      {!isAuthenticated && (
        <div className="px-8 pt-6">
          <div className="mx-auto max-w-3xl">
            <div
              className="rounded-lg p-4"
              style={{ background: 'rgba(255, 167, 38, 0.1)', border: '1px solid rgba(255, 167, 38, 0.3)' }}
            >
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 shrink-0" style={{ color: 'var(--color-warning)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="font-medium" style={{ color: 'var(--color-warning)' }}>
                    {t.options.notAuthenticated}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {t.options.notAuthenticatedDescription}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo: Sobre > Perfil > Configurações */}
      <main className="px-8 py-8">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* 1. Sobre */}
          <AboutSection />

          {/* 2. Perfil */}
          <AccountInfo isAuthenticated={isAuthenticated} user={user} onLogout={logout} />

          {/* 3. Configurações Gerais */}
          <SettingsForm />
        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-4" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <div className="mx-auto max-w-3xl">
          <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            v{chrome.runtime.getManifest().version} - Lexato © 2026
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <I18nProvider>
      <OptionsContent />
    </I18nProvider>
  );
}
