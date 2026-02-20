/**
 * Seletor de Variação de Design para o Side Panel
 *
 * Dropdown para alternar entre as 10 variações de design.
 * Usado para testes de UX antes de escolher o design final.
 *
 * @module VariationSelector
 */

import React from 'react';

interface VariationSelectorProps {
  /** Variação atual (1-10) */
  value: number;
  /** Callback ao mudar variação */
  onChange: (variation: number) => void;
}

const VARIATION_LABELS: Record<number, string> = {
  1: 'Minimalista Clean',
  2: 'Gradiente Moderno',
  3: 'Glassmorphism Premium',
  4: 'Neon Cyberpunk',
  5: 'Card Stack',
  6: 'Timeline',
  7: 'Floating Elements',
  8: 'Compact Dashboard',
  9: 'Split Panel',
  10: 'Premium Dark Elite',
};

export function VariationSelector({
  value,
  onChange,
}: VariationSelectorProps): React.ReactElement {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        background: 'linear-gradient(90deg, rgba(0, 222, 165, 0.15), rgba(0, 179, 136, 0.1))',
        borderBottom: '1px solid rgba(0, 222, 165, 0.3)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <span
        style={{
          fontSize: '10px',
          fontWeight: 700,
          color: '#00DEA5',
          textTransform: 'uppercase',
          letterSpacing: '1px',
        }}
      >
        Design:
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          flex: 1,
          padding: '6px 10px',
          background: '#18181b',
          border: '1px solid rgba(63, 63, 70, 0.5)',
          borderRadius: '6px',
          color: '#fafafa',
          fontSize: '11px',
          fontWeight: 500,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
          <option key={num} value={num}>
            {num}. {VARIATION_LABELS[num]}
          </option>
        ))}
      </select>
    </div>
  );
}

export default VariationSelector;
