/**
 * Componente de informações da conta do usuário
 *
 * Exibe avatar (imagem ou iniciais), créditos em destaque,
 * opções de segurança (redefinir senha, 2FA) e logout.
 * Totalmente internacionalizado (pt-BR, en, es).
 *
 * Prioridade de avatar: foto do app > foto do Google > iniciais
 *
 * @module AccountInfo
 */

import React, { useState, useCallback } from 'react';
import { useI18n } from '../../lib/i18n';
import type { AuthUser } from '../../types/auth.types';

interface AccountInfoProps {
  isAuthenticated: boolean;
  user: AuthUser | null;
  onLogout: () => Promise<void>;
}

/** Obtém as iniciais do nome completo */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p): p is string => p.length > 0);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first) return 'U';
  if (parts.length === 1 || !last) return first.charAt(0).toUpperCase();
  return `${first.charAt(0).toUpperCase()}${last.charAt(0).toUpperCase()}`;
}

const glassStyle: React.CSSProperties = {
  background: 'var(--glass-bg)',
  backdropFilter: 'blur(var(--glass-blur))',
  WebkitBackdropFilter: 'blur(var(--glass-blur))',
  border: '1px solid var(--glass-border)',
  borderRadius: 'var(--glass-radius)',
};

export default function AccountInfo({
  isAuthenticated,
  user,
  onLogout,
}: AccountInfoProps): React.ReactElement {
  const { t } = useI18n();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await onLogout();
    } catch (err) {
      console.error('[AccountInfo] Erro ao fazer logout:', err);
    } finally {
      setIsLoggingOut(false);
      setShowConfirmLogout(false);
    }
  }, [onLogout]);

  /** Abre link externo */
  const openLink = (url: string): void => {
    chrome.tabs.create({ url });
  };

  if (!isAuthenticated || !user) {
    return (
      <section className="rounded-xl p-6" style={glassStyle}>
        <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t.options.profile}
        </h2>
        <div
          className="flex items-center gap-4 rounded-lg p-4"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--sidebar-border)' }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--bg-elevated)' }}>
            <svg className="h-6 w-6" style={{ color: 'var(--text-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>{t.options.notAuthenticated}</p>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{t.options.notAuthenticatedDescription}</p>
          </div>
        </div>
      </section>
    );
  }

  const showAvatar = user.avatarUrl && !avatarError;
  const initials = getInitials(user.name ?? user.email ?? 'U');
  const accountTypeLabel = user.accountType === 'enterprise'
    ? t.options.accountTypeEnterprise
    : t.options.accountTypeIndividual;

  return (
    <section className="space-y-6">
      {/* Perfil e créditos */}
      <div className="rounded-xl p-6" style={glassStyle}>
        <h2 className="mb-5 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t.options.profile}
        </h2>
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold shrink-0"
            style={{
              background: showAvatar ? 'transparent' : 'linear-gradient(135deg, var(--green-deep), var(--green-mid))',
              color: 'var(--text-primary)',
              boxShadow: 'var(--glass-green-glow)',
              border: '3px solid rgba(0, 222, 165, 0.3)',
              overflow: 'hidden',
            }}
          >
            {showAvatar ? (
              <img
                src={user.avatarUrl}
                alt={user.name ?? 'Avatar'}
                className="h-full w-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              initials
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {user.name ?? t.options.user}
            </p>
            <p className="text-sm truncate" style={{ color: 'var(--text-tertiary)' }}>{user.email}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{accountTypeLabel}</p>
          </div>

          {/* Créditos em destaque */}
          <div
            className="flex flex-col items-center rounded-xl px-6 py-4 shrink-0"
            style={{ background: 'rgba(0, 222, 165, 0.08)', border: '1px solid rgba(0, 222, 165, 0.2)' }}
          >
            <span
              className="font-bold"
              style={{ fontSize: '32px', lineHeight: 1, color: user.credits > 0 ? 'var(--green-bright)' : '#ff6b6b' }}
            >
              {user.credits}
            </span>
            <span className="mt-1 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
              {t.options.creditsLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Segurança */}
      <div className="rounded-xl p-6" style={glassStyle}>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          {t.options.security}
        </h3>
        <div className="space-y-3">
          {/* 2FA */}
          <div
            className="flex items-center justify-between rounded-lg p-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--sidebar-border)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ background: user.mfaEnabled ? 'rgba(0, 222, 165, 0.15)' : 'rgba(255, 167, 38, 0.15)' }}
              >
                <svg className="h-5 w-5" style={{ color: user.mfaEnabled ? 'var(--green-bright)' : 'var(--color-warning)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{t.options.twoFactorAuth}</p>
                <p className="text-xs" style={{ color: user.mfaEnabled ? 'var(--color-success)' : 'var(--color-warning)' }}>
                  {user.mfaEnabled ? t.options.twoFactorEnabled : t.options.twoFactorDisabled}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openLink('https://app.lexato.com.br/settings/security')}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
              style={{ background: 'rgba(0, 222, 165, 0.1)', color: 'var(--green-bright)', border: '1px solid rgba(0, 222, 165, 0.2)' }}
            >
              {user.mfaEnabled ? t.options.manage : t.options.activate}
            </button>
          </div>

          {/* Redefinir senha */}
          <div
            className="flex items-center justify-between rounded-lg p-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--sidebar-border)' }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: 'rgba(0, 153, 120, 0.15)' }}>
                <svg className="h-5 w-5" style={{ color: 'var(--green-mid)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{t.options.resetPassword}</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t.options.resetPasswordDescription}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openLink('https://app.lexato.com.br/settings/password')}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
              style={{ background: 'rgba(0, 153, 120, 0.1)', color: 'var(--green-mid)', border: '1px solid rgba(0, 153, 120, 0.2)' }}
            >
              {t.options.change}
            </button>
          </div>

          {/* ID do usuário */}
          <div className="rounded-lg p-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--sidebar-border)' }}>
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{t.options.userId}</p>
            <p className="mt-1 truncate font-mono text-xs" style={{ color: 'var(--text-secondary)' }} title={user.id}>{user.id}</p>
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="rounded-xl p-6" style={glassStyle}>
        {!showConfirmLogout ? (
          <button
            type="button"
            onClick={() => setShowConfirmLogout(true)}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all w-full justify-center"
            style={{ background: 'rgba(239, 83, 80, 0.08)', color: 'var(--color-error)', border: '1px solid rgba(239, 83, 80, 0.2)' }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {t.options.signOut}
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-lg p-3" style={{ background: 'rgba(239, 83, 80, 0.08)', border: '1px solid rgba(239, 83, 80, 0.2)' }}>
            <p className="flex-1 text-sm" style={{ color: 'var(--text-secondary)' }}>{t.options.confirmSignOut}</p>
            <button
              type="button"
              onClick={() => setShowConfirmLogout(false)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--sidebar-border)' }}
              disabled={isLoggingOut}
            >
              {t.options.cancelButton}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium"
              style={{ background: 'var(--color-error)', color: 'var(--text-primary)' }}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--text-primary)' }} />
                  {t.options.signingOut}
                </>
              ) : t.options.confirmButton}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
