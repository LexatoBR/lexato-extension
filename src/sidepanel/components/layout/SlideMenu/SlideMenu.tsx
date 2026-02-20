/**
 * Menu Lateral Deslizante - Lexato Chrome Extension (Side Panel)
 *
 * Sidebar slide-in com:
 * - Perfil do usuario (avatar + nome + email) no topo
 * - Navegacao principal
 * - Secao de suporte e configuracoes
 * - Logout no rodape
 *
 * Migrado do popup para o Side Panel com layout responsivo.
 * Seletor de idioma removido - disponivel apenas no login e options.
 *
 * @module SlideMenu
 */

import React, { useEffect, useRef } from 'react';
import { useI18n } from '../../../../lib/i18n';
import './SlideMenu.css';

/** IDs das abas/paginas disponiveis */
export type MenuItemId = 'capture' | 'history' | 'diagnostic' | 'settings' | 'help';

/** Props do componente SlideMenu */
export interface SlideMenuProps {
  /** Se o menu esta aberto */
  isOpen: boolean;
  /** Callback para fechar o menu */
  onClose: () => void;
  /** Item atualmente ativo */
  activeItem: MenuItemId;
  /** Callback ao selecionar um item */
  onItemSelect: (item: MenuItemId) => void;
  /** Nome do usuario */
  userName?: string | undefined;
  /** Email do usuario */
  userEmail?: string | undefined;
  /** URL do avatar do usuario */
  avatarUrl?: string | undefined;
  /** Callback para logout */
  onLogout?: () => void;
}

/** Configuracao de cada item do menu */
interface MenuItem {
  id: MenuItemId;
  icon: React.ReactNode;
  label: string;
  description: string;
  /** Se o item abre link externo */
  isExternal?: boolean;
}

/**
 * Obtem as iniciais do nome completo
 */
function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter((p): p is string => p.length > 0);
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  if (!firstName) return 'U';
  if (parts.length === 1 || !lastName) return firstName.charAt(0).toUpperCase();
  return `${firstName.charAt(0).toUpperCase()}${lastName.charAt(0).toUpperCase()}`;
}

/**
 * Icones SVG para os itens do menu
 */
const MenuIcons = {
  capture: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  history: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  diagnostic: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  help: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  logout: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  close: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  externalLink: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
};


/**
 * Secao de perfil do usuario no topo do menu
 */
function UserProfile({
  userName,
  userEmail,
  avatarUrl,
}: {
  userName?: string | undefined;
  userEmail?: string | undefined;
  avatarUrl?: string | undefined;
}): React.ReactElement {
  const displayName = userName ?? 'Usuario';
  const displayEmail = userEmail ?? '';

  return (
    <div className="slide-menu-profile">
      <div className="slide-menu-profile-avatar">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="slide-menu-profile-avatar-img"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                const span = document.createElement('span');
                span.className = 'slide-menu-profile-avatar-initials';
                span.textContent = getInitials(displayName);
                parent.appendChild(span);
              }
            }}
          />
        ) : (
          <span className="slide-menu-profile-avatar-initials">
            {getInitials(displayName)}
          </span>
        )}
      </div>
      <div className="slide-menu-profile-info">
        <span className="slide-menu-profile-name">{displayName}</span>
        {displayEmail && (
          <span className="slide-menu-profile-email">{displayEmail}</span>
        )}
      </div>
    </div>
  );
}


/**
 * Item individual do menu
 */
function MenuItemButton({
  item,
  isActive,
  onClick,
}: {
  item: MenuItem;
  isActive: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`slide-menu-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <span className="slide-menu-item-icon">{item.icon}</span>
      <div className="slide-menu-item-content">
        <span className="slide-menu-item-label">
          {item.label}
          {item.isExternal && (
            <span className="slide-menu-external-icon">{MenuIcons.externalLink}</span>
          )}
        </span>
        <span className="slide-menu-item-description">{item.description}</span>
      </div>
      {isActive && <div className="slide-menu-item-indicator" />}
    </button>
  );
}


/**
 * Menu lateral deslizante com overlay
 */
export function SlideMenu({
  isOpen,
  onClose,
  activeItem,
  onItemSelect,
  userName,
  userEmail,
  avatarUrl,
  onLogout,
}: SlideMenuProps): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  /** Itens de navegacao principal */
  const navItems: MenuItem[] = [
    {
      id: 'capture',
      icon: MenuIcons.capture,
      label: t.menu.newCapture,
      description: t.menu.captureDescription,
    },
    {
      id: 'history',
      icon: MenuIcons.history,
      label: t.menu.history,
      description: t.menu.historyDescription,
    },
    {
      id: 'diagnostic',
      icon: MenuIcons.diagnostic,
      label: t.menu.diagnostic,
      description: t.menu.diagnosticDescription,
    },
  ];

  /** Itens de configuracao e suporte */
  const secondaryItems: MenuItem[] = [
    {
      id: 'settings',
      icon: MenuIcons.settings,
      label: t.menu.settingsLabel,
      description: t.menu.settingsDescription,
    },
    {
      id: 'help',
      icon: MenuIcons.help,
      label: t.menu.helpAndSupport,
      description: t.menu.helpDescription,
      isExternal: true,
    },
  ];

  /** Fecha o menu ao pressionar Escape */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  /** Handler para selecionar item */
  const handleItemClick = (id: MenuItemId): void => {
    onItemSelect(id);
    onClose();
  };

  /** Handler para logout */
  const handleLogout = (): void => {
    onClose();
    onLogout?.();
  };

  return (
    <div className={`slide-menu-container ${isOpen ? 'open' : ''}`}>
      {/* Overlay escuro */}
      <div
        className="slide-menu-overlay"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside ref={menuRef} className="slide-menu-sidebar" role="navigation" aria-label="Menu principal">
        {/* Botao fechar - posicionado na borda externa direita do sidebar */}
        <button
          type="button"
          className="slide-menu-close"
          onClick={onClose}
          aria-label="Fechar menu"
        >
          {MenuIcons.close}
        </button>

        {/* Perfil do usuario no topo */}
        <UserProfile
          userName={userName}
          userEmail={userEmail}
          avatarUrl={avatarUrl}
        />

        {/* Separador */}
        <div className="slide-menu-divider" />

        {/* Navegacao principal */}
        <nav className="slide-menu-nav">
          <span className="slide-menu-section-title">{t.menu.navigation}</span>
          {navItems.map((item) => (
            <MenuItemButton
              key={item.id}
              item={item}
              isActive={activeItem === item.id}
              onClick={() => handleItemClick(item.id)}
            />
          ))}
        </nav>

        {/* Separador */}
        <div className="slide-menu-divider" />

        {/* Secao de configuracoes e suporte */}
        <div className="slide-menu-nav">
          <span className="slide-menu-section-title">{t.menu.settings}</span>
          {secondaryItems.map((item) => (
            <MenuItemButton
              key={item.id}
              item={item}
              isActive={activeItem === item.id}
              onClick={() => handleItemClick(item.id)}
            />
          ))}
        </div>

        {/* Spacer para empurrar footer para baixo */}
        <div style={{ flex: 1 }} />

        {/* Footer com logout e versao */}
        <div className="slide-menu-footer">
          <button
            type="button"
            className="slide-menu-logout"
            onClick={handleLogout}
          >
            <span className="slide-menu-logout-icon">{MenuIcons.logout}</span>
            {t.menu.logout}
          </button>
          <span className="slide-menu-version">v{chrome.runtime.getManifest().version}</span>
        </div>
      </aside>
    </div>
  );
}

export default SlideMenu;
