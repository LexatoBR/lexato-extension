/**
 * Componente de informações sobre a extensão Lexato
 *
 * Exibe versão, descrição, links úteis e informações técnicas.
 * Totalmente internacionalizado (pt-BR, en, es).
 *
 * @module AboutSection
 */

import React, { useState, useEffect } from 'react';
import { useI18n } from '../../lib/i18n';
import lexatoLogo from '../../assets/branding/icon-48.webp';

/** Informações da extensão */
interface ExtensionInfo {
  version: string;
  name: string;
}

/** Links externos */
const EXTERNAL_LINKS = {
  documentation: 'https://docs.lexato.com.br',
  privacy: 'https://lexato.com.br/privacidade',
  terms: 'https://lexato.com.br/termos',
  support: 'https://lexato.com.br/suporte',
  github: 'https://github.com/LexatoBR/lexato-extension',
} as const;

/** Ícone de link externo reutilizável */
function ExternalLinkIcon(): React.ReactElement {
  return (
    <svg
      className="h-5 w-5 shrink-0"
      style={{ color: 'var(--green-mid)' }}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

/** Props de cada link */
interface LinkItemProps {
  label: string;
  description: string;
  url: string;
  iconBg: string;
  icon: React.ReactNode;
}

/** Componente de item de link reutilizável */
function LinkItem({ label, description, url, iconBg, icon }: LinkItemProps): React.ReactElement {
  const openLink = (): void => {
    chrome.tabs.create({ url });
  };

  return (
    <button
      type="button"
      onClick={openLink}
      className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-all"
      style={{ background: 'transparent', border: '1px solid var(--sidebar-border)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--green-mid)';
        e.currentTarget.style.background = 'rgba(0, 153, 120, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--sidebar-border)';
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{description}</p>
      </div>
      <ExternalLinkIcon />
    </button>
  );
}

export default function AboutSection(): React.ReactElement {
  const { t } = useI18n();
  const [extensionInfo, setExtensionInfo] = useState<ExtensionInfo>({
    version: '0.0.0',
    name: 'Lexato',
  });

  useEffect(() => {
    try {
      const manifest = chrome.runtime.getManifest();
      setExtensionInfo({
        version: manifest.version,
        name: manifest.name ?? 'Lexato',
      });
    } catch (err) {
      console.error('[AboutSection] Erro ao carregar manifest:', err);
    }
  }, []);

  const glassStyle: React.CSSProperties = {
    background: 'var(--glass-bg)',
    backdropFilter: 'blur(var(--glass-blur))',
    WebkitBackdropFilter: 'blur(var(--glass-blur))',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--glass-radius)',
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        {t.options.about}
      </h2>

      {/* Identidade da extensão */}
      <section className="rounded-xl p-6" style={glassStyle}>
        <div className="flex items-start gap-4">
          <img
            src={lexatoLogo}
            alt="Lexato"
            className="h-16 w-16 rounded-xl shrink-0"
          />
          <div>
            <h3
              className="text-xl font-bold"
              style={{ color: 'var(--green-bright)' }}
            >
              {extensionInfo.name}
            </h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {t.options.digitalEvidence}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ background: 'rgba(0, 153, 120, 0.2)', color: 'var(--green-mid)' }}
              >
                v{extensionInfo.version}
              </span>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ background: 'rgba(0, 222, 165, 0.2)', color: 'var(--green-bright)' }}
              >
                Manifest V3
              </span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t.options.aboutDescription}
        </p>
      </section>

      {/* Links úteis */}
      <section className="rounded-xl p-6" style={glassStyle}>
        <p
          className="mb-3 text-xs font-medium uppercase tracking-wider"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {t.options.usefulLinks}
        </p>
        <div className="space-y-2">
          <LinkItem
            label={t.options.documentation}
            description={t.options.documentationDescription}
            url={EXTERNAL_LINKS.documentation}
            iconBg="rgba(0, 153, 120, 0.2)"
            icon={
              <svg className="h-5 w-5" style={{ color: 'var(--green-mid)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            }
          />
          <LinkItem
            label={t.options.support}
            description={t.options.supportDescription}
            url={EXTERNAL_LINKS.support}
            iconBg="rgba(0, 222, 165, 0.2)"
            icon={
              <svg className="h-5 w-5" style={{ color: 'var(--green-bright)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            }
          />
          <LinkItem
            label={t.options.privacyPolicy}
            description={t.options.privacyPolicyDescription}
            url={EXTERNAL_LINKS.privacy}
            iconBg="rgba(0, 153, 120, 0.2)"
            icon={
              <svg className="h-5 w-5" style={{ color: 'var(--green-mid)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
          />
          <LinkItem
            label={t.options.termsOfUse}
            description={t.options.termsOfUseDescription}
            url={EXTERNAL_LINKS.terms}
            iconBg="rgba(0, 153, 120, 0.2)"
            icon={
              <svg className="h-5 w-5" style={{ color: 'var(--green-mid)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
          <LinkItem
            label={t.options.sourceCode}
            description={t.options.sourceCodeDescription}
            url={EXTERNAL_LINKS.github}
            iconBg="rgba(0, 153, 120, 0.2)"
            icon={
              <svg className="h-5 w-5" style={{ color: 'var(--green-mid)' }} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            }
          />
        </div>
      </section>

      {/* Informações técnicas */}
      <section className="rounded-xl p-6" style={glassStyle}>
        <p
          className="mb-3 text-xs font-medium uppercase tracking-wider"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {t.options.technicalInfo}
        </p>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {[
            { label: t.common.version.replace('{version}', ''), value: extensionInfo.version },
            { label: 'Manifest', value: 'V3' },
            { label: 'Framework', value: 'React 19' },
            { label: 'Bundler', value: 'Vite + CRXJS' },
          ].map((item) => (
            <div key={item.label} className="flex justify-between rounded-lg p-2" style={{ background: 'var(--bg-secondary)' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>{item.label}</span>
              <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{item.value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
