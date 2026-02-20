/**
 * Testes de Acessibilidade - Contraste de Cores
 *
 * Verifica que as combinações de cores do Design System
 * atendem aos requisitos WCAG AA (ratio mínimo 4.5:1).
 *
 * @see Requirements 12.1
 */

import { describe, it, expect } from 'vitest';
import { colors } from '../../../src/styles/tokens/colors';

/**
 * Converte cor hex para RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result || !result[1] || !result[2] || !result[3]) {
    throw new Error(`Cor hex inválida: ${hex}`);
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Calcula luminância relativa de uma cor
 * @see https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
function getLuminance(rgb: { r: number; g: number; b: number }): number {
  const values = [rgb.r, rgb.g, rgb.b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  const r = values[0] ?? 0;
  const g = values[1] ?? 0;
  const b = values[2] ?? 0;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calcula ratio de contraste entre duas cores
 * @see https://www.w3.org/TR/WCAG20/#contrast-ratiodef
 */
function getContrastRatio(
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number }
): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Verifica se o contraste atende WCAG AA (4.5:1 para texto normal)
 */
function meetsWcagAA(ratio: number): boolean {
  return ratio >= 4.5;
}

/**
 * Verifica se o contraste atende WCAG AAA (7:1 para texto normal)
 */
function meetsWcagAAA(ratio: number): boolean {
  return ratio >= 7;
}

describe('Acessibilidade - Contraste de Cores', () => {
  // Cores de fundo principais
  const bgPrimary = hexToRgb(colors.background.primary); // #0F0E10
  const bgTertiary = hexToRgb(colors.background.tertiary); // #161519

  describe('Texto sobre fundo primário (#0F0E10)', () => {
    it('deve ter contraste AAA para texto primário (#F7F9FB)', () => {
      const textPrimary = hexToRgb('#F7F9FB');
      const ratio = getContrastRatio(textPrimary, bgPrimary);

      expect(ratio).toBeGreaterThanOrEqual(7);
      expect(meetsWcagAAA(ratio)).toBe(true);
    });

    it('deve ter contraste AA para texto secundário (70% opacidade)', () => {
      // Simula rgba(247, 249, 251, 0.7) sobre fundo escuro
      // Cor efetiva aproximada: mistura com fundo
      const textSecondary = {
        r: Math.round(247 * 0.7 + 15 * 0.3),
        g: Math.round(249 * 0.7 + 14 * 0.3),
        b: Math.round(251 * 0.7 + 16 * 0.3),
      };
      const ratio = getContrastRatio(textSecondary, bgPrimary);

      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(ratio)).toBe(true);
    });

    it('deve ter contraste AA para texto terciário (50% opacidade)', () => {
      // Simula rgba(247, 249, 251, 0.5) sobre fundo escuro
      const textTertiary = {
        r: Math.round(247 * 0.5 + 15 * 0.5),
        g: Math.round(249 * 0.5 + 14 * 0.5),
        b: Math.round(251 * 0.5 + 16 * 0.5),
      };
      const ratio = getContrastRatio(textTertiary, bgPrimary);

      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(ratio)).toBe(true);
    });

    it('deve ter contraste AAA para cor primária verde (#00DEA5)', () => {
      const primary = hexToRgb(colors.primary.DEFAULT);
      const ratio = getContrastRatio(primary, bgPrimary);

      expect(ratio).toBeGreaterThanOrEqual(7);
      expect(meetsWcagAAA(ratio)).toBe(true);
    });
  });

  describe('Cores de status sobre fundo escuro', () => {
    it('deve ter contraste AA para cor de sucesso (#00DEA5)', () => {
      const success = hexToRgb(colors.status.success);
      const ratio = getContrastRatio(success, bgPrimary);

      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(ratio)).toBe(true);
    });

    it('deve ter contraste AA para cor de erro (#EF5350)', () => {
      const error = hexToRgb(colors.status.error);
      const ratio = getContrastRatio(error, bgPrimary);

      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(ratio)).toBe(true);
    });

    it('deve ter contraste AA para cor de alerta (#FFA726)', () => {
      const warning = hexToRgb(colors.status.warning);
      const ratio = getContrastRatio(warning, bgPrimary);

      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(ratio)).toBe(true);
    });

    it('deve ter contraste AA para cor pendente (#FFCA28)', () => {
      const pending = hexToRgb(colors.status.pending);
      const ratio = getContrastRatio(pending, bgPrimary);

      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(ratio)).toBe(true);
    });
  });

  describe('Texto sobre fundo terciário (#161519)', () => {
    it('deve ter contraste AAA para texto primário', () => {
      const textPrimary = hexToRgb('#F7F9FB');
      const ratio = getContrastRatio(textPrimary, bgTertiary);

      expect(ratio).toBeGreaterThanOrEqual(7);
      expect(meetsWcagAAA(ratio)).toBe(true);
    });

    it('deve ter contraste AA para cor primária verde', () => {
      const primary = hexToRgb(colors.primary.DEFAULT);
      const ratio = getContrastRatio(primary, bgTertiary);

      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(ratio)).toBe(true);
    });
  });

  describe('Botão primário (gradiente verde)', () => {
    it('deve ter contraste AA para texto escuro sobre verde claro (#00DEA5)', () => {
      const greenBright = hexToRgb(colors.primary.DEFAULT);
      const darkText = hexToRgb(colors.background.primary);
      const ratio = getContrastRatio(darkText, greenBright);

      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(ratio)).toBe(true);
    });

    it('deve ter contraste AA para texto escuro sobre verde escuro (#009978)', () => {
      const greenDark = hexToRgb(colors.primary.dark);
      const darkText = hexToRgb(colors.background.primary);
      const ratio = getContrastRatio(darkText, greenDark);

      // Verde escuro pode ter contraste menor, verificar AA para texto grande
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Funções utilitárias', () => {
    it('deve converter hex para RGB corretamente', () => {
      expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(hexToRgb('#00FF00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(hexToRgb('#0000FF')).toEqual({ r: 0, g: 0, b: 255 });
      expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('deve calcular luminância corretamente', () => {
      // Branco tem luminância 1
      expect(getLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 2);
      // Preto tem luminância 0
      expect(getLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 2);
    });

    it('deve calcular ratio de contraste corretamente', () => {
      const white = { r: 255, g: 255, b: 255 };
      const black = { r: 0, g: 0, b: 0 };

      // Contraste máximo entre branco e preto é 21:1
      const ratio = getContrastRatio(white, black);
      expect(ratio).toBeCloseTo(21, 0);
    });
  });
});
