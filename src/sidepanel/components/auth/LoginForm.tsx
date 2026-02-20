/**
 * Formulário de login do Side Panel Lexato
 *
 * Fluxo de login simplificado:
 * - Email + Senha direto no Supabase Auth
 * - Seletor de idioma no footer
 *
 * Migrado de popup/components/LoginForm.tsx para sidepanel
 * com layout responsivo (sem dimensões fixas do popup).
 *
 * @module LoginForm
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n, LOCALE_SHORT } from '../../../lib/i18n';
import type { Locale } from '../../../lib/i18n';

/**
 * Detecta se estamos em ambiente de desenvolvimento/staging
 */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
const _isDevelopmentOrStaging =
  import.meta.env.DEV === true ||
  import.meta.env['VITE_ENV'] === 'staging' ||
  (import.meta.env['VITE_API_BASE_URL']?.includes('staging') ?? false) ||
  (import.meta.env['VITE_API_BASE_URL']?.includes('localhost') ?? false);
/* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
void _isDevelopmentOrStaging;

/**
 * Chaves do Cloudflare Turnstile
 * Configurada via variável de ambiente VITE_TURNSTILE_SITE_KEY
 */
const TURNSTILE_SITE_KEY = import.meta.env['VITE_TURNSTILE_SITE_KEY'] ?? '';

/**
 * Flag para desabilitar Turnstile
 * Configurada via variável de ambiente VITE_TURNSTILE_DISABLED
 */
const TURNSTILE_DISABLED = import.meta.env['VITE_TURNSTILE_DISABLED'] === 'true';

/**
 * Seletor compacto de idioma para a tela de login
 */
function LoginLanguageSelector(): React.ReactElement {
  const { locale, setLocale } = useI18n();
  const locales: Locale[] = ['pt-BR', 'en', 'es'];

  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {locales.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => setLocale(loc)}
          style={{
            padding: '3px 8px',
            fontSize: '11px',
            fontWeight: locale === loc ? 700 : 500,
            fontFamily: 'inherit',
            color: locale === loc ? 'var(--green-bright)' : 'var(--text-tertiary)',
            background: locale === loc ? 'rgba(0, 222, 165, 0.1)' : 'transparent',
            border: `1px solid ${locale === loc ? 'rgba(0, 222, 165, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {LOCALE_SHORT[loc]}
        </button>
      ))}
    </div>
  );
}

/**
 * Componente de formulário de login
 */
export default function LoginForm(): React.ReactElement {
  const { login, loginWithGoogle, error: authError, clearError } = useAuth();
  const { t } = useI18n();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(TURNSTILE_DISABLED ? 'disabled' : null);
  const [turnstileLoaded, setTurnstileLoaded] = useState(TURNSTILE_DISABLED);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);

  const LOGIN_STATE_KEY = 'lexato_login_form_state';

  /** Carrega estado persistido do formulário ao montar */
  useEffect(() => {
    const loadPersistedState = async () => {
      try {
        const result = await chrome.storage.session.get([LOGIN_STATE_KEY]);
        const savedState = result[LOGIN_STATE_KEY] as {
          email: string;
          savedAt: number;
        } | undefined;

        if (savedState) {
          const isExpired = Date.now() - savedState.savedAt > 3 * 60 * 1000;
          if (isExpired) {
            await chrome.storage.session.remove([LOGIN_STATE_KEY]);
            console.warn('[LoginForm] Estado expirado (>3min), limpando...');
            return;
          }
          setEmail(savedState.email);
          console.warn('[LoginForm] Estado restaurado');
        }
      } catch (err) {
        console.error('[LoginForm] Erro ao carregar estado:', err);
      }
    };
    loadPersistedState();
  }, []);

  /** Persiste estado do formulário quando muda */
  useEffect(() => {
    const persistState = async () => {
      try {
        if (email) {
          await chrome.storage.session.set({
            [LOGIN_STATE_KEY]: { email, savedAt: Date.now() },
          });
        }
      } catch (err) {
        console.error('[LoginForm] Erro ao persistir estado:', err);
      }
    };
    persistState();
  }, [email]);

  /** Carrega o script do Cloudflare Turnstile */
  useEffect(() => {
    if (TURNSTILE_DISABLED) return;
    if (window.turnstile) { setTurnstileLoaded(true); return; }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => setTurnstileLoaded(true);
    document.head.appendChild(script);

    return () => {
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetId.current);
      }
    };
  }, []);

  /** Renderiza o widget Turnstile quando carregado */
  useEffect(() => {
    if (TURNSTILE_DISABLED || !turnstileLoaded || !turnstileRef.current) return;
    if (turnstileWidgetId.current) return;

    const widgetId = window.turnstile?.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => setTurnstileToken(token),
      'error-callback': () => setLocalError(t.login.errorSecurityCheck),
      'expired-callback': () => setTurnstileToken(null),
      theme: 'dark',
      size: 'normal',
    });
    turnstileWidgetId.current = widgetId ?? null;
  }, [turnstileLoaded, t]);

  /** Valida campos do formulário */
  const validateForm = useCallback((): boolean => {
    if (!email.trim()) { setLocalError(t.login.errorEmailRequired); return false; }
    if (!email.includes('@')) { setLocalError(t.login.errorEmailInvalid); return false; }
    if (!password) { setLocalError(t.login.errorPasswordRequired); return false; }
    if (password.length < 6) { setLocalError(t.login.errorPasswordMinLength); return false; }
    if (!turnstileToken && !TURNSTILE_DISABLED) { setLocalError(t.login.errorSecurityCheck); return false; }
    return true;
  }, [email, password, turnstileToken, t]);

  /** Limpa erros ao digitar */
  const handleInputChange = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string>>) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setter(e.target.value);
        setLocalError(null);
        clearError();
      },
    [clearError]
  );

  /** Submete credenciais de login */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLocalError(null);
      if (!validateForm()) return;

      setIsSubmitting(true);
      try {
        const result = await login(email.trim(), password, turnstileToken ?? undefined);
        if (result.mfaRequired || result.mfaSetupRequired) {
          setLocalError(t.login.errorMfaDisabled);
          if (turnstileWidgetId.current && window.turnstile) {
            window.turnstile.reset(turnstileWidgetId.current);
            setTurnstileToken(null);
          }
        } else if (!result.success) {
          setLocalError(result.error ?? t.login.errorLoginFailed);
          if (turnstileWidgetId.current && window.turnstile) {
            window.turnstile.reset(turnstileWidgetId.current);
            setTurnstileToken(null);
          }
        }
      } catch {
        setLocalError(t.login.errorServerConnection);
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password, turnstileToken, login, validateForm, t]
  );

  const displayError = localError ?? authError;

  /** Submete login com Google */
  const handleGoogleLogin = useCallback(async () => {
    setLocalError(null);
    clearError();
    setIsGoogleLoading(true);
    try {
      const result = await loginWithGoogle();
      if (!result.success) {
        setLocalError(result.error ?? t.login.googleLoginError);
      }
    } catch {
      setLocalError(t.login.googleLoginError);
    } finally {
      setIsGoogleLoading(false);
    }
  }, [loginWithGoogle, clearError, t]);

  return (
    <div className="glass-card p-6 animate-fade-slide-in flex flex-col" style={{ minHeight: '100%' }}>
      {/* Header: Logo + Frase descritiva */}
      <div className="text-center mb-6">
        <div className="flex justify-center">
          <div
            className="relative flex items-center justify-center"
            style={{ padding: '12px 24px 4px' }}
          >
            <div
              className="absolute inset-0 rounded-2xl opacity-50"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(0, 222, 165, 0.2) 0%, rgba(0, 222, 165, 0.05) 50%, transparent 70%)',
                animation: 'pulse-glow 3s ease-in-out infinite',
              }}
            />
            <img
              src={new URL('../../../assets/branding/lexato-logo.webp', import.meta.url).href}
              alt="Lexato - Provas Digitais"
              className="h-12 w-auto relative z-10"
              style={{ filter: 'drop-shadow(0 0 16px rgba(0, 222, 165, 0.3))' }}
            />
          </div>
        </div>
        <p className="text-sm leading-relaxed px-2 mt-1" style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
          {t.login.tagline}
        </p>
      </div>

      {/* Linha separadora */}
      <div className="h-px mb-5" style={{ background: 'linear-gradient(90deg, transparent, rgba(0, 222, 165, 0.3), transparent)' }} />

      {/* Título da seção de login */}
      <div className="text-center mb-4">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t.login.accessAccount}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          {t.login.enterCredentials}
        </p>
      </div>

        <form onSubmit={handleSubmit} className="flex-1">
        {/* Erro */}
        {displayError && (
          <div
            className="rounded-lg p-3 text-sm font-medium mb-4"
            style={{
              backgroundColor: 'rgba(239, 83, 80, 0.15)',
              color: '#ff6b6b',
              border: '1px solid rgba(239, 83, 80, 0.5)',
              boxShadow: '0 0 12px rgba(239, 83, 80, 0.3), inset 0 0 8px rgba(239, 83, 80, 0.1)'
            }}
          >
            {displayError}
          </div>
        )}

        {/* Campo de email */}
        <div className="mb-4">
          <label htmlFor="email" className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {t.login.email}
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 6L2 7" />
              </svg>
            </div>
            <input
              id="email"
              type="email"
              value={email}
              onChange={handleInputChange(setEmail)}
              placeholder={t.login.emailPlaceholder}
              className="input-text pl-11"
              autoFocus
              autoComplete="email"
            />
          </div>
        </div>

        {/* Campo de senha - Só aparece quando começa a digitar o email */}
        <div 
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            email.length > 0 ? 'max-h-24 opacity-100 translate-y-0 mb-4' : 'max-h-0 opacity-0 -translate-y-2'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="password" className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              {t.login.password}
            </label>
            <a
              href="https://app.lexato.com.br/recuperar-senha"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium transition-colors hover:underline"
              style={{ color: 'var(--green-mid)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--green-bright)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--green-mid)'}
            >
              {t.login.forgotPassword}
            </a>
          </div>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={handleInputChange(setPassword)}
              placeholder="••••••••"
              className="input-text pl-11 pr-12"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors hover:bg-white/10"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label={showPassword ? t.login.hidePassword : t.login.showPassword}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Cloudflare Turnstile */}
        {!TURNSTILE_DISABLED && (
          <div className="flex justify-center mb-4">
            <div ref={turnstileRef} />
            {!turnstileLoaded && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                <div className="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin"
                     style={{ borderColor: 'var(--green-mid)', borderTopColor: 'transparent' }} />
                {t.login.loadingVerification}
              </div>
            )}
          </div>
        )}

        {/* Botão de login - Só aparece quando começa a digitar */}
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
          email.length > 0 ? 'max-h-20 opacity-100 translate-y-0' : 'max-h-0 opacity-0 translate-y-2'
        }`}>
          <button
            type="submit"
            disabled={isSubmitting || (!TURNSTILE_DISABLED && !turnstileToken)}
            className={`btn-primary w-full ${isSubmitting ? 'loading' : ''}`}
          >
            {isSubmitting ? t.login.entering : t.login.enter}
          </button>
        </div>

        {/* Opções alternativas - Somente visíveis quando não há email digitado */}
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
          email.length === 0 ? 'max-h-40 opacity-100 translate-y-0' : 'max-h-0 opacity-0 translate-y-4'
        }`}>
          {/* Separador "ou continue com" */}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px" style={{ background: 'rgba(255, 255, 255, 0.08)' }} />
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {t.login.orContinueWith}
            </span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255, 255, 255, 0.08)' }} />
          </div>

          {/* Botão de login com Google */}
          <div className="pt-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isGoogleLoading || isSubmitting}
              className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'var(--text-primary)',
                cursor: isGoogleLoading ? 'wait' : 'pointer',
                opacity: isGoogleLoading ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isGoogleLoading) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
              }}
            >
              {isGoogleLoading ? (
                <div
                  className="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: 'var(--text-secondary)', borderTopColor: 'transparent' }}
                />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              )}
              {isGoogleLoading ? t.login.googleLoggingIn : t.login.googleLogin}
            </button>
          </div>
        </div>
      </form>

      {/* Link para criar conta */}
      <p className="text-center text-sm mt-4" style={{ color: 'var(--text-secondary)' }}>
        {t.login.noAccount}{' '}
        <a
          href="https://app.lexato.com.br/cadastro"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold transition-colors hover:underline cursor-pointer"
          style={{ color: 'var(--green-mid)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--green-bright)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--green-mid)'}
        >
          {t.login.createAccount}
        </a>
      </p>

      {/* Spacer */}
      <div className="flex-1 min-h-4" />

      {/* Footer com links, versão e seletor de idioma */}
      <footer className="flex items-center justify-between text-xs pt-3" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <div className="flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
          <a
            href="https://lexato.com.br/termos-de-uso"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline transition-colors cursor-pointer"
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = ''}
          >
            {t.login.terms}
          </a>
          <span>|</span>
          <a
            href="https://lexato.com.br/politica-de-privacidade"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline transition-colors cursor-pointer"
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = ''}
          >
            {t.login.privacy}
          </a>
        </div>

        {/* Seletor de idioma */}
        <LoginLanguageSelector />
      </footer>
    </div>
  );
}
