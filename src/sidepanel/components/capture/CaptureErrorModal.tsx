/**
 * Modal de Erro de Captura - Lexato Chrome Extension
 *
 * Exibe erros do pipeline com tema escuro consistente
 * com a identidade visual Lexato. Oferece opções de
 * retry ou cancelamento, e registra erros automaticamente.
 *
 * Migrado de popup/components/CaptureErrorModal.tsx para sidepanel
 * com layout responsivo (sem dimensões fixas do popup).
 *
 * @module CaptureErrorModal
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useI18n } from '../../../lib/i18n';

/**
 * Detalhes do erro a ser exibido
 */
export interface CaptureErrorDetails {
  /** Código do erro (ex: ERR_CAPTURE_001) */
  code: string;
  /** Mensagem amigável em PT-BR */
  message: string;
  /** Se o erro pode ser recuperado com retry */
  isRecoverable: boolean;
  /** Fase do pipeline onde ocorreu */
  phase?: string;
  /** Número de tentativas já realizadas */
  retryCount?: number;
  /** Máximo de tentativas permitidas */
  maxRetries?: number;
  /** Detalhes técnicos (para debug) */
  technicalDetails?: string;
  /** Stack trace (apenas em desenvolvimento) */
  stack?: string;
}

/**
 * Props do componente CaptureErrorModal
 */
interface CaptureErrorModalProps {
  /** Se o modal está visível */
  isOpen: boolean;
  /** Detalhes do erro */
  error: CaptureErrorDetails | null;
  /** Callback para tentar novamente */
  onRetry?: () => void;
  /** Callback para cancelar/fechar */
  onCancel: () => void;
  /** Se está em processo de retry */
  isRetrying?: boolean;
}

/**
 * Mapeamento de fases para nomes amigáveis (fallback)
 * Em uso normal, as traduções vêm do i18n
 */
const PHASE_NAMES: Record<string, string> = {
  capture: 'Captura',
  timestamp: 'Carimbo de Tempo',
  upload: 'Envio para Nuvem',
  preview: 'Preview',
  blockchain: 'Registro Blockchain',
  certificate: 'Certificado',
};

/**
 * Mapeamento de códigos de erro para mensagens de ajuda
 */
const ERROR_HELP: Record<string, string> = {
  CAPTURE_TIMEOUT: 'A captura demorou mais do que o esperado. Tente novamente em uma conexão mais estável.',
  UPLOAD_TIMEOUT: 'O envio do arquivo demorou demais. Verifique sua conexão e tente novamente.',
  NETWORK_OFFLINE: 'Você está sem conexão com a internet. Reconecte e tente novamente.',
  NETWORK_ERROR: 'Houve um problema de conexão. Verifique sua internet e tente novamente.',
  AUTH_TOKEN_EXPIRED: 'Sua sessão expirou. Faça login novamente na extensão.',
  AUTH_INSUFFICIENT_CREDITS: 'Você não tem créditos suficientes. Adquira mais créditos para continuar.',
  TIMESTAMP_FAILED: 'Não foi possível obter o carimbo de tempo. O serviço pode estar temporariamente indisponível.',
  BLOCKCHAIN_FAILED: 'O registro na blockchain falhou. Isso pode ocorrer por congestionamento na rede.',
  UNKNOWN_ERROR: 'Ocorreu um erro inesperado. Se o problema persistir, entre em contato com o suporte.',
};

/**
 * Ícones SVG inline para o modal de erro
 */
const ErrorIcons = {
  alert: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  retry: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
  close: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  chevronDown: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  chevronUp: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
};

/**
 * Registra o erro automaticamente via Sentry (se disponível)
 * e armazena localmente como fallback
 */
function logErrorToCloud(error: CaptureErrorDetails): void {
  try {
    chrome.runtime.sendMessage({
      type: 'LOG_CAPTURE_ERROR',
      payload: {
        code: error.code,
        message: error.message,
        phase: error.phase,
        retryCount: error.retryCount,
        timestamp: new Date().toISOString(),
        technicalDetails: error.technicalDetails,
      },
    }).catch(() => {
      const errorLog = {
        code: error.code,
        phase: error.phase,
        timestamp: new Date().toISOString(),
      };
      chrome.storage.local.get('lexato_error_queue').then((result) => {
        const queue = (result['lexato_error_queue'] as unknown[]) ?? [];
        queue.push(errorLog);
        const trimmed = queue.slice(-50);
        chrome.storage.local.set({ lexato_error_queue: trimmed });
      });
    });
  } catch {
    // Silenciar erros de logging para não afetar UX
  }
}

/**
 * Modal de erro de captura - tema escuro Lexato
 *
 * Adaptado para Side Panel: usa width: 100% e maxWidth responsivo
 * em vez de dimensões fixas do popup.
 */
export function CaptureErrorModal({
  isOpen,
  error,
  onRetry,
  onCancel,
  isRetrying = false,
}: CaptureErrorModalProps): React.ReactElement | null {
  const [showDetails, setShowDetails] = useState(false);
  const { t } = useI18n();

  const toggleDetails = useCallback(() => {
    setShowDetails((prev) => !prev);
  }, []);

  // Registrar erro automaticamente ao abrir o modal
  useEffect(() => {
    if (isOpen && error) {
      logErrorToCloud(error);
    }
  }, [isOpen, error]);

  if (!isOpen || !error) {
    return null;
  }

  const phaseName = error.phase ? PHASE_NAMES[error.phase] ?? error.phase : null;
  const helpText = ERROR_HELP[error.code] ?? ERROR_HELP['UNKNOWN_ERROR'];
  const canRetry = error.isRecoverable && onRetry;
  const retriesLeft = error.maxRetries && error.retryCount !== undefined
    ? error.maxRetries - error.retryCount
    : null;

  // Traduzir nome da fase via i18n quando disponível
  const phaseMap: Record<string, string> = {
    capture: t.captureError.phaseCapture,
    timestamp: t.captureError.phaseTimestamp,
    upload: t.captureError.phaseUpload,
    preview: t.captureError.phasePreview,
    blockchain: t.captureError.phaseBlockchain,
    certificate: t.captureError.phaseCertificate,
  };
  const translatedPhase = error.phase ? phaseMap[error.phase] ?? phaseName : null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        width: '100%',
        minWidth: '360px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          margin: '0 16px',
          borderRadius: '16px',
          background: 'linear-gradient(180deg, #1a1a1e 0%, #141316 100%)',
          border: '1px solid rgba(255, 107, 107, 0.2)',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.6), 0 0 24px rgba(255, 107, 107, 0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '20px 20px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          {/* Ícone de erro com glow */}
          <div
            style={{
              width: '44px',
              height: '44px',
              minWidth: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '12px',
              background: 'rgba(255, 107, 107, 0.1)',
              border: '1px solid rgba(255, 107, 107, 0.15)',
              boxShadow: '0 0 16px rgba(255, 107, 107, 0.1)',
            }}
          >
            {ErrorIcons.alert}
          </div>
          <div style={{ flex: 1 }}>
            <h3
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1.3,
              }}
            >
              {t.captureError.title}
            </h3>
            {translatedPhase && (
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '12px',
                  color: 'var(--text-tertiary)',
                }}
              >
                {t.captureError.phase}: {translatedPhase}
              </p>
            )}
          </div>
          <button
            onClick={onCancel}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            aria-label={t.captureError.close}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.color = 'var(--text-tertiary)';
            }}
          >
            {ErrorIcons.close}
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px' }}>
          {/* Mensagem principal */}
          <p
            style={{
              margin: '0 0 8px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
              lineHeight: 1.5,
            }}
          >
            {error.message}
          </p>

          {/* Texto de ajuda */}
          <p
            style={{
              margin: '0 0 16px',
              fontSize: '13px',
              color: 'var(--text-tertiary)',
              lineHeight: 1.5,
            }}
          >
            {helpText}
          </p>

          {/* Contador de tentativas */}
          {retriesLeft !== null && retriesLeft > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(255, 193, 7, 0.08)',
                border: '1px solid rgba(255, 193, 7, 0.15)',
              }}
            >
              <span style={{ color: '#ffc107', display: 'flex' }}>{ErrorIcons.warning}</span>
              <p
                style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#ffc107',
                }}
              >
                {t.captureError.retriesLeft.replace('{count}', String(retriesLeft))} {retriesLeft === 1 ? t.captureError.retryOnce : t.captureError.retryMultiple}.
              </p>
            </div>
          )}

          {/* Erro não recuperável */}
          {!error.isRecoverable && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(255, 107, 107, 0.08)',
                border: '1px solid rgba(255, 107, 107, 0.15)',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#ff8a8a',
                  lineHeight: 1.5,
                }}
              >
                {t.captureError.nonRecoverable}
              </p>
            </div>
          )}

          {/* Detalhes técnicos (colapsável) */}
          {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Lógica booleana intencional: string vazia deve ser falsy */}
          {(error.technicalDetails || error.code) && (
            <div style={{ marginBottom: '4px' }}>
              <button
                onClick={toggleDetails}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-tertiary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                }}
              >
                <span>{t.captureError.technicalDetails}</span>
                {showDetails ? ErrorIcons.chevronUp : ErrorIcons.chevronDown}
              </button>
              {showDetails && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: 'var(--text-tertiary)',
                    lineHeight: 1.6,
                  }}
                >
                  <p style={{ margin: 0 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t.captureError.code}:</span> {error.code}
                  </p>
                  {error.phase && (
                    <p style={{ margin: '4px 0 0' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{t.captureError.phase}:</span> {error.phase}
                    </p>
                  )}
                  {error.retryCount !== undefined && (
                    <p style={{ margin: '4px 0 0' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{t.captureError.attempts}:</span> {error.retryCount}
                    </p>
                  )}
                  {error.technicalDetails && (
                    <p
                      style={{
                        margin: '8px 0 0',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                      }}
                    >
                      {error.technicalDetails}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer com botões */}
        <div
          style={{
            display: 'flex',
            gap: '10px',
            padding: '16px 20px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
          >
            {canRetry ? t.captureError.cancel : t.captureError.close}
          </button>

          {canRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying || (retriesLeft !== null && retriesLeft <= 0)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: isRetrying
                  ? 'rgba(0, 222, 165, 0.15)'
                  : 'linear-gradient(135deg, var(--green-mid), var(--green-bright))',
                border: 'none',
                color: isRetrying ? 'var(--green-bright)' : 'var(--bg-primary)',
                fontSize: '13px',
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: isRetrying ? 'wait' : 'pointer',
                opacity: (retriesLeft !== null && retriesLeft <= 0) ? 0.4 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  animation: isRetrying ? 'spin 1s linear infinite' : 'none',
                }}
              >
                {ErrorIcons.retry}
              </span>
              {isRetrying ? t.captureError.trying : t.captureError.tryAgain}
            </button>
          )}
        </div>
      </div>

      {/* Animação de spin para o ícone de retry */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default CaptureErrorModal;
