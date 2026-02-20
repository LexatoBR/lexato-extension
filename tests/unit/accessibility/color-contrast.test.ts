/**
 * Testes de Contraste de Cores - Lexato Chrome Extension
 *
 * Verifica conformidade WCAG AA com ratio mínimo de 4.5:1 para texto normal
 * e 3:1 para texto grande (18px+ ou 14px+ bold).
 *
 * @see Requirements 12.1
 */

import { describe, it, expect } from 'vitest';
import { colors } from '@/styles/tokens/colors';

/**
 * Converte cor hexadecimal para RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result?.[1] || !result[2] || !result[3]) {
    return null;
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Converte rgba para RGB (ignora alpha para cálculo de contraste)
 */
function rgbaToRgb(rgba: string): { r: number; g: number; b: number } | null {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
  };
}

/**
 * Calcula luminância relativa de uma cor
 * @see https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
function getLuminance(r: number, g: number, b: number): number {
  const values = [r, g, b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  const rs = values[0] ?? 0;
  const gs = values[1] ?? 0;
  const bs = values[2] ?? 0;
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calcula ratio de contraste entre duas cores
 * @see https://www.w3.org/TR/WCAG20/#contrast-ratiodef
 */
function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = color1.startsWith('#') ? hexToRgb(color1) : rgbaToRgb(color1);
  const rgb2 = color2.startsWith('#') ? hexToRgb(color2) : rgbaToRgb(color2);

  if (!rgb1 || !rgb2) {
    throw new Error(`Cor inválida: ${!rgb1 ? color1 : color2}`);
  }

  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Ratio mínimo WCAG AA para texto normal (< 18px ou < 14px bold)
 */
const WCAG_AA_NORMAL = 4.5;

/**
 * Ratio mínimo WCAG AA para texto grande (>= 18px ou >= 14px bold)
 */
const WCAG_AA_LARGE = 3.0;

describe('Contraste de Cores - WCAG AA', () => {
  describe('Texto primário sobre backgrounds', () => {
    it('deve ter contraste >= 4.5:1 para texto primário sobre bg-primary', () => {
      const ratio = getContrastRatio(colors.text.primary, colors.background.primary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    it('deve ter contraste >= 4.5:1 para texto primário sobre bg-secondary', () => {
      const ratio = getContrastRatio(colors.text.primary, colors.background.secondary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    it('deve ter contraste >= 4.5:1 para texto primário sobre bg-tertiary', () => {
      const ratio = getContrastRatio(colors.text.primary, colors.background.tertiary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    it('deve ter contraste >= 4.5:1 para texto primário sobre bg-elevated', () => {
      const ratio = getContrastRatio(colors.text.primary, colors.background.elevated);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  });

  describe('Texto secundário sobre backgrounds', () => {
    it('deve ter contraste >= 4.5:1 para texto secundário sobre bg-primary', () => {
      // Texto secundário é rgba(247, 249, 251, 0.7) - aproximamos para #A9AEB3
      const textSecondary = '#A9AEB3';
      const ratio = getContrastRatio(textSecondary, colors.background.primary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  });

  describe('Cor primária (verde) sobre backgrounds', () => {
    it('deve ter contraste >= 3:1 para verde primário sobre bg-primary (texto grande)', () => {
      const ratio = getContrastRatio(colors.primary.DEFAULT, colors.background.primary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    });

    it('deve ter contraste >= 3:1 para verde primário sobre bg-tertiary (texto grande)', () => {
      const ratio = getContrastRatio(colors.primary.DEFAULT, colors.background.tertiary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    });
  });

  describe('Cores de status sobre backgrounds', () => {
    it('deve ter contraste >= 3:1 para cor de sucesso sobre bg-primary', () => {
      const ratio = getContrastRatio(colors.status.success, colors.background.primary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    });

    it('deve ter contraste >= 3:1 para cor de erro sobre bg-primary', () => {
      const ratio = getContrastRatio(colors.status.error, colors.background.primary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    });

    it('deve ter contraste >= 3:1 para cor de warning sobre bg-primary', () => {
      const ratio = getContrastRatio(colors.status.warning, colors.background.primary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    });

    it('deve ter contraste >= 3:1 para cor de pending sobre bg-primary', () => {
      const ratio = getContrastRatio(colors.status.pending, colors.background.primary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    });
  });

  describe('Texto sobre botão primário', () => {
    it('deve ter contraste >= 4.5:1 para texto escuro sobre verde primário', () => {
      // Texto escuro (#0F0E10) sobre botão verde (#00DEA5)
      const ratio = getContrastRatio(colors.background.primary, colors.primary.DEFAULT);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  });

  describe('Badges de contagem', () => {
    it('deve ter contraste >= 4.5:1 para texto escuro sobre badge amarelo', () => {
      // Badge de contagem: texto escuro sobre amarelo (#FFCA28)
      const ratio = getContrastRatio(colors.background.primary, colors.status.pending);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  });
});

describe('Funções auxiliares de contraste', () => {
  it('deve calcular luminância corretamente para branco', () => {
    const lum = getLuminance(255, 255, 255);
    expect(lum).toBeCloseTo(1, 2);
  });

  it('deve calcular luminância corretamente para preto', () => {
    const lum = getLuminance(0, 0, 0);
    expect(lum).toBeCloseTo(0, 2);
  });

  it('deve calcular ratio 21:1 para preto e branco', () => {
    const ratio = getContrastRatio('#FFFFFF', '#000000');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('deve converter hex para RGB corretamente', () => {
    const rgb = hexToRgb('#00DEA5');
    expect(rgb).toEqual({ r: 0, g: 222, b: 165 });
  });

  it('deve converter rgba para RGB corretamente', () => {
    const rgb = rgbaToRgb('rgba(247, 249, 251, 0.7)');
    expect(rgb).toEqual({ r: 247, g: 249, b: 251 });
  });
});
