/**
 * Componente Header do Design System Lexato
 *
 * Header com seletor de contexto, widget de créditos, indicador de ambiente e notificações.
 * Altura fixa de 64px com efeito glassmorphism.
 *
 * @see Requirements 9.1-9.5, 23.1-23.6
 */

import React from 'react';
import { Badge } from '../ui/Badge';
import {
  EnvironmentIndicator,
  type EnvironmentStatus,
  type EnvironmentCheck,
} from './EnvironmentIndicator';

/**
 * Tipo de contexto do usuário
 */
export type HeaderContext = 'personal' | 'enterprise';

/**
 * Props do componente Header
 */
export interface HeaderProps extends React.HTMLAttributes<HTMLElement> {
  /** Contexto atual (pessoal ou enterprise) */
  context?: HeaderContext;
  /** Nome da empresa (quando contexto enterprise) */
  enterpriseName?: string;
  /** Créditos disponíveis */
  credits?: number;
  /** Créditos máximos para cálculo do progresso */
  maxCredits?: number;
  /** Número de notificações não lidas */
  notificationCount?: number;
  /** Status do ambiente */
  environmentStatus?: EnvironmentStatus;
  /** Lista de verificações do ambiente */
  environmentChecks?: EnvironmentCheck[];
  /** Callback ao clicar no seletor de contexto */
  onContextClick?: () => void;
  /** Callback ao clicar no widget de créditos */
  onCreditsClick?: () => void;
  /** Callback ao clicar no botão de notificações */
  onNotificationsClick?: () => void;
  /** Callback ao clicar no indicador de ambiente (navegar para diagnóstico) */
  onEnvironmentClick?: () => void;
}

/**
 * Ícone de usuário para contexto pessoal
 */
const UserIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

/**
 * Ícone de empresa para contexto enterprise
 */
const BuildingIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z" />
  </svg>
);

/**
 * Ícone de chevron para dropdown
 */
const ChevronDownIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
  </svg>
);

/**
 * Ícone de sino para notificações
 */
const BellIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
  </svg>
);

/**
 * Subcomponente: Seletor de Contexto
 *
 * Exibe o contexto atual (Pessoal ou Enterprise) com dropdown
 */
const ContextSelector: React.FC<{
  context: HeaderContext;
  enterpriseName?: string | undefined;
  onClick?: (() => void) | undefined;
}> = ({ context, enterpriseName, onClick }) => {
  const isEnterprise = context === 'enterprise';
  const label = isEnterprise ? (enterpriseName ?? 'Empresa') : 'Conta Pessoal';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-md transition-colors duration-200 hover:bg-[rgba(255,255,255,0.05)]"
      aria-label={`Contexto atual: ${label}. Clique para trocar`}
      aria-haspopup="listbox"
    >
      {/* Ícone do contexto */}
      <span className="text-text-secondary">
        {isEnterprise ? <BuildingIcon /> : <UserIcon />}
      </span>

      {/* Texto do contexto */}
      <span className="text-[13px] font-medium text-text-primary">{label}</span>

      {/* Badge Enterprise */}
      {isEnterprise && (
        <span className="px-1.5 py-0.5 rounded bg-[rgba(0,222,165,0.15)] text-primary text-[10px] font-semibold uppercase">
          Enterprise
        </span>
      )}

      {/* Chevron */}
      <ChevronDownIcon className="w-4 h-4 text-text-tertiary" />
    </button>
  );
};

/**
 * Subcomponente: Widget de Créditos
 *
 * Exibe créditos disponíveis com círculo de progresso SVG
 */
const CreditsWidget: React.FC<{
  credits: number;
  maxCredits: number;
  onClick?: (() => void) | undefined;
}> = ({ credits, maxCredits, onClick }) => {
  // Calcula a porcentagem de créditos
  const percentage = Math.min((credits / maxCredits) * 100, 100);

  // Parâmetros do círculo SVG (44px para acessibilidade - tamanho mínimo de toque)
  const size = 44;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-11 h-11 flex items-center justify-center transition-transform duration-200 hover:scale-105 header-action"
      aria-label={`${credits} créditos disponíveis de ${maxCredits}`}
      title="Créditos disponíveis"
    >
      {/* SVG do círculo de progresso */}
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
        aria-hidden="true"
      >
        {/* Círculo de fundo */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
        />
        {/* Círculo de progresso */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#00DEA5"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-300"
        />
      </svg>

      {/* Valor dos créditos */}
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-text-primary">
        {credits}
      </span>
    </button>
  );
};

/**
 * Subcomponente: Botão de Notificações
 *
 * Exibe ícone de sino com badge de contagem
 */
const NotificationButton: React.FC<{
  count: number;
  onClick?: (() => void) | undefined;
}> = ({ count, onClick }) => {
  const hasNotifications = count > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-11 h-11 flex items-center justify-center rounded-md text-text-secondary transition-all duration-200 hover:bg-[rgba(255,255,255,0.05)] hover:text-text-primary header-action"
      aria-label={hasNotifications ? `${count} notificações não lidas` : 'Sem notificações'}
    >
      <BellIcon />

      {/* Badge de contagem */}
      {hasNotifications && (
        <Badge
          variant="count"
          count={count}
          className="absolute -top-0.5 -right-0.5"
        />
      )}
    </button>
  );
};

/**
 * Componente Header do Design System Lexato
 *
 * Características:
 * - Altura fixa de 64px
 * - Seletor de contexto (Pessoal/Enterprise) à esquerda
 * - Indicador de integridade do ambiente
 * - Widget de créditos com círculo de progresso
 * - Ícone de notificações com badge de contagem
 * - Badge "ENTERPRISE" quando contexto enterprise
 * - Backdrop-filter blur para efeito glass
 *
 * @example
 * ```tsx
 * // Header com contexto pessoal e ambiente íntegro
 * <Header
 *   context="personal"
 *   credits={50}
 *   maxCredits={100}
 *   notificationCount={3}
 *   environmentStatus="healthy"
 *   onContextClick={() => console.log('Trocar contexto')}
 *   onCreditsClick={() => console.log('Ver créditos')}
 *   onNotificationsClick={() => console.log('Ver notificações')}
 *   onEnvironmentClick={() => console.log('Ver diagnóstico')}
 * />
 *
 * // Header com avisos no ambiente
 * <Header
 *   context="enterprise"
 *   enterpriseName="Lexato Corp"
 *   credits={200}
 *   maxCredits={500}
 *   notificationCount={0}
 *   environmentStatus="warning"
 *   environmentChecks={[
 *     { name: 'Conexão API', status: 'warning', message: 'Latência alta' }
 *   ]}
 *   onEnvironmentClick={() => navigate('/diagnostic')}
 * />
 * ```
 */
export const Header = React.forwardRef<HTMLElement, HeaderProps>(
  (
    {
      context = 'personal',
      enterpriseName,
      credits = 0,
      maxCredits = 100,
      notificationCount = 0,
      environmentStatus = 'healthy',
      environmentChecks = [],
      onContextClick,
      onCreditsClick,
      onNotificationsClick,
      onEnvironmentClick,
      className = '',
      ...props
    },
    ref
  ) => {
    const classes = [
      'h-16',
      'px-4',
      'flex items-center justify-between',
      'bg-transparent',
      'backdrop-blur-lg',
      'border-b border-[rgba(255,255,255,0.08)]',
      className,
    ].join(' ');

    return (
      <header ref={ref} className={classes} {...props}>
        {/* Lado esquerdo: Seletor de contexto */}
        <ContextSelector
          context={context}
          enterpriseName={enterpriseName}
          onClick={onContextClick}
        />

        {/* Lado direito: Ambiente, Créditos e Notificações */}
        <div className="flex items-center gap-3">
          <EnvironmentIndicator
            status={environmentStatus}
            checks={environmentChecks}
            {...(onEnvironmentClick && { onNavigateToDiagnostic: onEnvironmentClick })}
          />
          <CreditsWidget
            credits={credits}
            maxCredits={maxCredits}
            onClick={onCreditsClick}
          />
          <NotificationButton
            count={notificationCount}
            onClick={onNotificationsClick}
          />
        </div>
      </header>
    );
  }
);

Header.displayName = 'Header';

export default Header;
