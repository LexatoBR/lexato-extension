/**
 * Header do Side Panel - Lexato Chrome Extension
 *
 * Layout horizontal: Logo | Hamburger | Spacer | Badge de Creditos
 * Avatar e menu do usuario foram movidos para o SlideMenu.
 * Migrado do popup para o Side Panel com layout responsivo.
 *
 * @module Header
 */

import React, { useState, useRef, useEffect } from 'react';
import { useI18n } from '../../../lib/i18n';
import './Header.css';

/** Props do componente Header */
interface HeaderProps {
  /** Quantidade de creditos disponiveis */
  credits?: number | undefined;
  /** Creditos utilizados no mes atual */
  usedThisMonth?: number | undefined;
  /** Nome do plano atual */
  planName?: string | undefined;
  /** Callback para abrir menu lateral */
  onMenuClick?: (() => void) | undefined;
}

/**
 * Icones SVG
 */
const Icons = {
  hamburger: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
};

/**
 * Botao Hamburger para abrir menu lateral
 */
function HamburgerButton({ onClick }: { onClick?: (() => void) | undefined }): React.ReactElement {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="header-hamburger"
      onClick={onClick}
      aria-label={t.header.openMenu}
      title={t.header.menuTooltip}
    >
      {Icons.hamburger}
    </button>
  );
}

/**
 * Logo Lexato completa com glow effect
 */
function LexatoLogo(): React.ReactElement {
  return (
    <div className="header-logo-container">
      <div className="header-logo-glow" />
      <img
        src={new URL('../../../assets/branding/lexato-logo.webp', import.meta.url).href}
        alt="Lexato - Provas Digitais"
        className="header-logo-img"
        onError={(e) => {
          console.error('[Header] Erro ao carregar logo:', e);
        }}
      />
    </div>
  );
}

/**
 * Badge de Creditos - Design elegante e compacto
 */
function CreditsBadge({
  credits,
  usedThisMonth = 0,
  planName = 'Gratuito',
}: {
  credits: number;
  usedThisMonth?: number | undefined;
  planName?: string | undefined;
}): React.ReactElement {
  const { t } = useI18n();
  const [showModal, setShowModal] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowModal(false);
      }
    };

    if (showModal) {
      document.addEventListener('click', handleClickOutside, true);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [showModal]);

  const handleBuyClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    chrome.tabs.create({ url: 'https://lexato.com.br/precos' });
  };

  return (
    <div ref={wrapperRef} className="header-credits-wrapper">
      <button
        type="button"
        className={`header-credits-badge ${credits === 0 ? 'empty' : ''}`}
        onClick={() => setShowModal(!showModal)}
      >
        <span className={`header-credits-value ${credits === 0 ? 'zero' : ''}`}>
          {credits}
        </span>
        <span className="header-credits-label">
          {credits === 1 ? t.header.credit : t.header.credits}
        </span>
      </button>

      {showModal && (
        <div className="header-credits-modal" onClick={(e) => e.stopPropagation()}>
          <div className="header-modal-header">
            <strong>{t.header.creditBalance}</strong>
          </div>
          <div className="header-modal-content">
            <div className="header-modal-row">
              <span>{t.header.available}</span>
              <span className={`header-modal-value ${credits === 0 ? 'zero' : ''}`}>{credits}</span>
            </div>
            <div className="header-modal-row">
              <span>{t.header.usedThisMonth}</span>
              <span>{usedThisMonth}</span>
            </div>
            <div className="header-modal-row">
              <span>{t.header.currentPlan}</span>
              <span>{planName}</span>
            </div>
          </div>
          <div className="header-modal-footer">
            <button type="button" onClick={handleBuyClick}>{t.header.buyMore}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Header do Side Panel - layout horizontal responsivo
 * Logo | Hamburger | Spacer | Badge de creditos
 */
export function Header({
  credits = 0,
  usedThisMonth,
  planName,
  onMenuClick,
}: HeaderProps): React.ReactElement {
  return (
    <div className="header-container">
      {/* Logo Lexato (esquerda) */}
      <LexatoLogo />

      {/* Botao Hamburger */}
      <HamburgerButton onClick={onMenuClick} />

      {/* Spacer flexivel */}
      <div className="header-spacer" />

      {/* Badge de creditos (direita) */}
      <CreditsBadge
        credits={credits}
        usedThisMonth={usedThisMonth}
        planName={planName}
      />
    </div>
  );
}

export default Header;
