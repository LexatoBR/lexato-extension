/**
 * Seção de Seleção de Tipo de Captura
 *
 * Exibe subtítulo no estilo consistente com "Instruções de Segurança"
 * e reutiliza o CaptureTypeSelector original com cards glassmorfismo.
 *
 * @module CaptureTypeCompact
 */

import React from 'react';
import { useI18n } from '../../../../lib/i18n';
import { CaptureTypeSelector } from '../../../../components/shared/CaptureTypeSelector';
import type { CaptureType } from '../../../../types/capture.types';

interface CaptureTypeCompactProps {
  /** Tipo selecionado (null = nenhum) */
  value: CaptureType | null;
  /** Callback ao selecionar */
  onChange: (type: CaptureType) => void;
  /** Se está desabilitado */
  disabled?: boolean;
}

/** Ícone de seleção/grid para o subtítulo */
function GridIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-bright)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

/**
 * Seção de seleção com subtítulo consistente e cards originais empilhados
 */
export function CaptureTypeCompact({
  value,
  onChange,
  disabled = false,
}: CaptureTypeCompactProps): React.ReactElement {
  const { t } = useI18n();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flexShrink: 0 }}>
      {/* Subtítulo no estilo "Instruções de Segurança" */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <GridIcon />
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {t.capture.subtitle}
        </h3>
      </div>

      {/* Cards originais com glassmorfismo */}
      <CaptureTypeSelector
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

export default CaptureTypeCompact;
