/**
 * Painel de Diagnóstico da Extensão Lexato
 *
 * Interface completa para verificação de integridade da extensão.
 * Exibe status, verificações detalhadas e opções de exportação.
 * Sem emojis - apenas ícones SVG inline.
 *
 * Migrado de popup/components/DiagnosticPanel.tsx para o Side Panel.
 *
 * @module DiagnosticPanel
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PageDescriptionHeader } from '../../../components/shared/PageDescriptionHeader';
import { PrimaryButton } from '../../../components/shared/PrimaryButton';
import { useI18n } from '../../../lib/i18n';
import { useDiagnostic } from '../../hooks/useDiagnostic';
import type { DiagnosticCheckResult, DiagnosticOverallStatus } from '../../../lib/diagnostic';
import './DiagnosticPanel.css';

// ============================================================================
// ÍCONES SVG
// ============================================================================

function ToolIcon(): React.ReactElement {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function DownloadIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CopyIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function RefreshIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function ChevronIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function WrenchIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function InfoIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function ShieldCheckIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

/** Ícone de check (sucesso) */
function CheckCircleIcon({ size = 18 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#00dea5" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

/** Ícone de alerta (warning) */
function AlertTriangleIcon({ size = 18 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffc107" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/** Ícone de erro (crítico) */
function XCircleIcon({ size = 18 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

/** Ícone de corrigido */
function WrenchStatusIcon({ size = 18 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#00dea5" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

/** Ícone de loading/spinner */
function LoaderIcon({ size = 18 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" className="diagnostic-spin-icon">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Retorna ícone SVG para status
 */
function StatusIcon({ status, size = 18 }: { status: string; size?: number }): React.ReactElement {
  switch (status) {
    case 'healthy':
    case 'success':
      return <CheckCircleIcon size={size} />;
    case 'warning':
      return <AlertTriangleIcon size={size} />;
    case 'critical':
    case 'error':
      return <XCircleIcon size={size} />;
    case 'fixed':
      return <WrenchStatusIcon size={size} />;
    case 'running':
      return <LoaderIcon size={size} />;
    default:
      return <LoaderIcon size={size} />;
  }
}

/**
 * Formata data para exibição
 */
function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Obtém informações da plataforma
 */
function getPlatformInfo(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('CrOS')) return 'Chrome OS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Desconhecido';
}

// ============================================================================
// COMPONENTES INTERNOS
// ============================================================================

/**
 * Seção de informações combinada (intro + tech info)
 */
interface InfoSectionProps {
  extensionVersion: string;
  chromeVersion: string;
  platform: string;
  lastCheckAt?: string | undefined;
  totalDurationMs?: number | undefined;
}

function InfoSection({ 
  extensionVersion, 
  chromeVersion, 
  platform, 
  lastCheckAt,
  totalDurationMs 
}: InfoSectionProps): React.ReactElement {
  const { t } = useI18n();
  const isHomologated = true;

  return (
    <div className="diagnostic-info-section">
      <div className="diagnostic-info-header">
        <div className="diagnostic-info-icon">
          <ShieldCheckIcon />
        </div>
        <div className="diagnostic-info-title">
          <h3>{t.diagnostic.integrityCheck}</h3>
          <p>{t.diagnostic.integrityDescription}</p>
        </div>
        <span className={`diagnostic-homologation-badge diagnostic-homologation-badge--${isHomologated ? 'success' : 'warning'}`}>
          {isHomologated ? (
            <><CheckCircleIcon size={12} /> {t.diagnostic.homologated}</>
          ) : (
            <><AlertTriangleIcon size={12} /> {t.diagnostic.pending}</>
          )}
        </span>
      </div>

      <div className="diagnostic-tech-grid">
        <div className="diagnostic-tech-item">
          <span className="diagnostic-tech-label">{t.diagnostic.extension}</span>
          <span className="diagnostic-tech-value">v{extensionVersion}</span>
        </div>
        <div className="diagnostic-tech-item">
          <span className="diagnostic-tech-label">{t.diagnostic.chrome}</span>
          <span className="diagnostic-tech-value">v{chromeVersion}</span>
        </div>
        <div className="diagnostic-tech-item">
          <span className="diagnostic-tech-label">{t.diagnostic.platform}</span>
          <span className="diagnostic-tech-value">{platform}</span>
        </div>
        <div className="diagnostic-tech-item">
          <span className="diagnostic-tech-label">{t.diagnostic.lastCheck}</span>
          <span className="diagnostic-tech-value">
            {lastCheckAt ? formatDateTime(lastCheckAt) : '\u2014'}
          </span>
        </div>
        <div className="diagnostic-tech-item">
          <span className="diagnostic-tech-label">{t.diagnostic.duration}</span>
          <span className="diagnostic-tech-value">
            {totalDurationMs ? `${totalDurationMs}ms` : '\u2014'}
          </span>
        </div>
        <div className="diagnostic-tech-item">
          <span className="diagnostic-tech-label">{t.diagnostic.status}</span>
          <span className="diagnostic-tech-value">
            {lastCheckAt ? t.diagnostic.verified : t.diagnostic.waiting}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Card de status geral
 */
interface StatusCardProps {
  status: DiagnosticOverallStatus;
  counts: { success: number; warnings: number; errors: number };
}

function StatusCard({ status, counts }: StatusCardProps): React.ReactElement {
  const { t } = useI18n();

  const getTitle = (s: DiagnosticOverallStatus): string => {
    switch (s) {
      case 'healthy': return t.diagnostic.healthyEnvironment;
      case 'warning': return t.diagnostic.warningsDetected;
      case 'critical': return t.diagnostic.criticalProblems;
      case 'running': return t.diagnostic.checking;
      default: return t.diagnostic.awaitingDiagnostic;
    }
  };

  const getSubtitle = (s: DiagnosticOverallStatus): string => {
    switch (s) {
      case 'healthy': return t.diagnostic.allChecksPassed.replace('{count}', String(counts.success));
      case 'warning': return t.diagnostic.warningsNeedAttention.replace('{count}', String(counts.warnings));
      case 'critical': return t.diagnostic.criticalProblemsFound.replace('{count}', String(counts.errors));
      case 'running': return t.diagnostic.runningChecks;
      default: return t.diagnostic.runDiagnosticDescription;
    }
  };

  return (
    <div className={`diagnostic-status-card diagnostic-status-card--${status}`}>
      <div className={`diagnostic-status-card__icon diagnostic-status-card__icon--${status}`}>
        <StatusIcon status={status} size={24} />
      </div>
      <div className="diagnostic-status-card__content">
        <h3 className="diagnostic-status-card__title">{getTitle(status)}</h3>
        <p className="diagnostic-status-card__subtitle">{getSubtitle(status)}</p>
      </div>
    </div>
  );
}

/**
 * Contadores de status
 */
function Counters({ counts }: { counts: { success: number; warnings: number; errors: number; total: number } }): React.ReactElement {
  const { t } = useI18n();
  return (
    <div className="diagnostic-counters">
      <div className="diagnostic-counter">
        <span className="diagnostic-counter__value diagnostic-counter__value--success">{counts.success}</span>
        <span className="diagnostic-counter__label">{t.diagnostic.success}</span>
      </div>
      <div className="diagnostic-counter">
        <span className="diagnostic-counter__value diagnostic-counter__value--warning">{counts.warnings}</span>
        <span className="diagnostic-counter__label">{t.diagnostic.warnings}</span>
      </div>
      <div className="diagnostic-counter">
        <span className="diagnostic-counter__value diagnostic-counter__value--error">{counts.errors}</span>
        <span className="diagnostic-counter__label">{t.diagnostic.errors}</span>
      </div>
    </div>
  );
}

/**
 * Tooltip customizado
 */
function Tooltip({ text, children }: { text: string; children: React.ReactNode }): React.ReactElement {
  const [visible, setVisible] = useState(false);
  return (
    <div className="diagnostic-tooltip-wrapper" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && <div className="diagnostic-tooltip">{text}</div>}
    </div>
  );
}

/**
 * Item de verificação individual
 */
function CheckItem({ check, onAutoFix }: { check: DiagnosticCheckResult; onAutoFix?: (checkId: string) => Promise<boolean> }): React.ReactElement {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [fixing, setFixing] = useState(false);

  const handleAutoFix = async (): Promise<void> => {
    if (!onAutoFix) return;
    setFixing(true);
    try { await onAutoFix(check.id); } finally { setFixing(false); }
  };

  const hasDetails = check.details && Object.keys(check.details).length > 0;
  const isRepaired = check.repaired ?? (check.status === 'fixed');

  return (
    <div className={`diagnostic-check ${expanded ? 'diagnostic-check--expanded' : ''} ${isRepaired ? 'diagnostic-check--repaired' : ''}`}>
      <div className={`diagnostic-check__status diagnostic-check__status--${check.status}`}>
        <StatusIcon status={check.status} />
      </div>
      <div className="diagnostic-check__content">
        <div className="diagnostic-check__header">
          <div className="diagnostic-check__name-row">
            <h4 className="diagnostic-check__name">
              {check.name}
              {isRepaired && <span className="diagnostic-badge diagnostic-badge--fixed">{t.diagnostic.repaired}</span>}
            </h4>
            {check.tooltip && (
              <Tooltip text={check.tooltip}>
                <button type="button" className="diagnostic-check__info-btn" aria-label={t.diagnostic.moreInfo}>
                  <InfoIcon />
                </button>
              </Tooltip>
            )}
          </div>
          <div className="diagnostic-check__meta">
            {check.durationMs && <span className="diagnostic-check__duration">{check.durationMs}ms</span>}
            {hasDetails && (
              <button
                type="button"
                className={`diagnostic-check__expand ${expanded ? 'diagnostic-check__expand--expanded' : ''}`}
                onClick={() => setExpanded(!expanded)}
                aria-label={expanded ? t.diagnostic.hideDetails : t.diagnostic.viewDetails}
              >
                <ChevronIcon />
              </button>
            )}
          </div>
        </div>
        {check.message && <p className="diagnostic-check__message">{check.message}</p>}
        {expanded && hasDetails && (
          <pre className="diagnostic-check__details">{JSON.stringify(check.details, null, 2)}</pre>
        )}
        {check.canAutoFix && check.status !== 'success' && !isRepaired && (
          <div className="diagnostic-check__actions">
            <button type="button" className="diagnostic-fix-btn" onClick={handleAutoFix} disabled={fixing}>
              <WrenchIcon />
              {fixing ? t.diagnostic.fixing : t.diagnostic.tryFix}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Barra de progresso
 */
function ProgressBar({ progress, currentCheck }: { progress: number; currentCheck: DiagnosticCheckResult | null }): React.ReactElement {
  return (
    <div className="diagnostic-progress">
      <div className="diagnostic-progress__bar">
        <div className="diagnostic-progress__fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="diagnostic-progress__text">
        <div className="diagnostic-progress__current">
          {currentCheck && (
            <>
              <div className="diagnostic-progress__spinner" />
              <span>{currentCheck.name}</span>
            </>
          )}
        </div>
        <span>{progress}%</span>
      </div>
    </div>
  );
}

/**
 * Estado vazio / inicial
 */
function EmptyState({ onStart, isRunning }: { onStart: () => void; isRunning: boolean }): React.ReactElement {
  const { t } = useI18n();
  return (
    <div className="diagnostic-empty">
      <div className="diagnostic-empty__icon"><ToolIcon /></div>
      <h3 className="diagnostic-empty__title">{t.diagnostic.checkAndRepair}</h3>
      <p className="diagnostic-empty__description">{t.diagnostic.runDiagnosticDescription}</p>
      <PrimaryButton onClick={onStart} loading={isRunning} showArrow={false}>
        {isRunning ? t.diagnostic.verifying : t.diagnostic.runDiagnosticAndRepair}
      </PrimaryButton>
    </div>
  );
}

/**
 * Toast de feedback
 */
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }): React.ReactElement {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`diagnostic-toast diagnostic-toast--${type}`}>
      {type === 'success' ? <CheckCircleIcon size={16} /> : <XCircleIcon size={16} />}
      <span>{message}</span>
    </div>
  );
}


// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

/**
 * Painel de Diagnóstico
 */
export function DiagnosticPanel(): React.ReactElement {
  const { t } = useI18n();
  const {
    isRunning,
    progress,
    currentCheck,
    result,
    overallStatus,
    statusCounts,
    startDiagnostic,
    tryAutoFix,
    copyReportToClipboard,
    downloadReport,
    reset,
  } = useDiagnostic();

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleCopyReport = useCallback(async (): Promise<void> => {
    const success = await copyReportToClipboard();
    setToast({
      message: success ? t.diagnostic.reportCopied : t.diagnostic.copyError,
      type: success ? 'success' : 'error',
    });
  }, [copyReportToClipboard, t]);

  const handleDownload = useCallback((): void => {
    downloadReport('text');
    setToast({ message: t.diagnostic.downloadStarted, type: 'success' });
  }, [downloadReport, t]);

  useEffect(() => {
    if (!result && !isRunning) {
      startDiagnostic();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRestart = useCallback(() => {
    reset();
    setTimeout(() => startDiagnostic(), 0);
  }, [reset, startDiagnostic]);

  return (
    <div className="diagnostic-panel">
      <PageDescriptionHeader
        title={t.diagnostic.title}
        subtitle={t.diagnostic.subtitle}
        icon={<ToolIcon />}
      />

      <InfoSection
        extensionVersion={result?.extensionVersion ?? chrome.runtime.getManifest().version}
        chromeVersion={result?.chromeVersion ?? (navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? 'unknown')}
        platform={result?.platform ?? getPlatformInfo()}
        lastCheckAt={result?.completedAt}
        totalDurationMs={result?.totalDurationMs}
      />

      {isRunning && <ProgressBar progress={progress} currentCheck={currentCheck} />}

      {!result && !isRunning && <EmptyState onStart={startDiagnostic} isRunning={isRunning} />}

      {result && !isRunning && (
        <>
          <StatusCard status={overallStatus} counts={statusCounts} />
          <Counters counts={statusCounts} />

          <div className="diagnostic-checks">
            <h4 className="diagnostic-checks__title">{t.diagnostic.checkResult}</h4>
            {result.checks.map((check) => (
              <CheckItem key={check.id} check={check} onAutoFix={tryAutoFix} />
            ))}
          </div>

          <div className="diagnostic-actions">
            <Tooltip text={t.diagnostic.runDiagnosticAndRepair}>
              <button type="button" className="diagnostic-action-btn diagnostic-action-btn--primary" onClick={handleRestart}>
                <RefreshIcon />
                {t.diagnostic.runAgain}
              </button>
            </Tooltip>
            <Tooltip text={t.diagnostic.copyReport}>
              <button type="button" className="diagnostic-action-btn diagnostic-action-btn--icon" onClick={handleCopyReport}>
                <CopyIcon />
              </button>
            </Tooltip>
            <Tooltip text={t.diagnostic.downloadReport}>
              <button type="button" className="diagnostic-action-btn diagnostic-action-btn--icon" onClick={handleDownload}>
                <DownloadIcon />
              </button>
            </Tooltip>
          </div>
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default DiagnosticPanel;
