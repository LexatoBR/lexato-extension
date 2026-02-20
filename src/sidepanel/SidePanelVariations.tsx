/**
 * Side Panel de Gravação - Variação 9 (Split Panel)
 *
 * Otimizado para largura mínima de 360px (Chrome side panel)
 * Focado no estado de gravação ativa de vídeo
 *
 * @module SidePanelVariations
 */

import React from 'react';
import type { RecordingState } from './types';
import { ForensicHUD } from './components/ForensicHUD';
import './SidePanelVariations.css';

// ============================================================================
// Props e Tipos
// ============================================================================

export interface SidePanelVariationsProps {
  /** Estado da gravação */
  recordingState: RecordingState;
  /** Variação de design (mantido por compatibilidade, sempre 9) */
  variation: number;
  /** Callback para finalizar */
  onFinalize: () => void;
  /** Callback para cancelar */
  onCancel: () => void;
}

interface VariationProps {
  state: RecordingState;
  onFinalize: () => void;
  onCancel: () => void;
}

// ============================================================================
// Utilitários
// ============================================================================

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function calculateProgress(elapsed: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.min(100, Math.floor((elapsed / max) * 100));
}

function truncateUrl(url: string, max = 40): string {
  return url.length > max ? `${url.substring(0, max - 3)}...` : url;
}

// ============================================================================
// Componente Principal
// ============================================================================

export function SidePanelVariations({
  recordingState,
  onFinalize,
  onCancel,
}: SidePanelVariationsProps): React.ReactElement {
  return (
    <Variation9
      state={recordingState}
      onFinalize={onFinalize}
      onCancel={onCancel}
    />
  );
}

// ============================================================================
// VARIAÇÃO 9: Split Panel
// Layout dividido com seções distintas
// Otimizado para 360px de largura mínima
// ============================================================================

function Variation9({ state, onFinalize, onCancel }: VariationProps): React.ReactElement {
  const progress = calculateProgress(state.elapsedMs, state.maxDurationMs);
  const isProcessing = state.status === 'stopping';

  return (
    <div className="spv spv-9">
      {/* Header com logo Lexato */}
      <header className="spv-9__header">
        <div className="spv-9__logo">
          <LexatoLogo />
        </div>
        <div className="spv-9__rec-indicator">
          <span className="spv-9__rec-dot" />
          GRAVANDO
        </div>
      </header>

      {/* Seção Timer */}
      <div className="spv-9__section spv-9__section--timer">
        <div className="spv-9__timer">{formatTime(state.elapsedMs)}</div>
        <div className="spv-9__progress-bar">
          <div className="spv-9__progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="spv-9__progress-label">{progress}% de {formatTime(state.maxDurationMs)}</span>
        
        {/* Controles movidos para perto do timer */}
        <div className="spv-9__controls-inline">
          <button 
            className="spv-9__btn-primary" 
            onClick={onFinalize} 
            disabled={isProcessing}
            title="Clique para concluir a gravação e processar o vídeo capturado"
          >
            <span className="spv-9__btn-primary-bg" />
            <span className="spv-9__btn-primary-hover-bg" />
            {!isProcessing && <span className="spv-9__btn-primary-spark" />}
            <span className="spv-9__btn-primary-text">
              {isProcessing ? 'Finalizando...' : 'Concluir'}
              {!isProcessing && (
                <span className="spv-9__btn-primary-arrow">
                  <ArrowRightIcon />
                </span>
              )}
            </span>
          </button>
          <button 
            className="spv-9__btn-secondary" 
            onClick={onCancel} 
            disabled={isProcessing}
            style={{ width: '100%' }}
          >
            Cancelar
          </button>
        </div>
      </div>

      {/* Seção Forensic HUD */}
      <div className="spv-9__section spv-9__section--forensic">
        <ForensicHUD />
      </div>

      {/* Seção Timeline de Navegação - sempre visível */}
      <div className="spv-9__section spv-9__section--nav">
        <h3 className="spv-9__section-title">Páginas Visitadas ({state.navigationHistory.length})</h3>
        {state.navigationHistory.length > 0 ? (
          <div className="spv-9__nav-list">
            {state.navigationHistory.map((entry, i) => (
              <div key={i} className="spv-9__nav-item" title={entry.fullUrl}>
                <span className="spv-9__nav-time">{entry.formattedTime}</span>
                <div className="spv-9__nav-info">
                  <span className="spv-9__nav-title">{entry.title || truncateUrl(entry.url, 28)}</span>
                  <span className="spv-9__nav-url">{truncateUrl(entry.fullUrl || entry.url, 35)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="spv-9__nav-empty">
            Navegue entre páginas para ver o histórico de URLs capturadas
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Ícones
// ============================================================================

/**
 * Ícone de seta para direita (usado no botão spark border)
 */
function ArrowRightIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/**
 * Logo Lexato - usa a imagem SVG oficial da marca
 */
function LexatoLogo(): React.ReactElement {
  return (
    <img
      src={new URL('../assets/branding/lexato-logo.webp', import.meta.url).href}
      alt="Lexato"
      style={{ height: '24px', width: 'auto' }}
    />
  );
}

export default SidePanelVariations;
