/**
 * Testes unitários para Design Tokens do Design System Lexato
 *
 * Valida que todos os tokens estão definidos corretamente
 * com os valores oficiais da marca Lexato.
 *
 * @see Requirements 1.1-1.8
 */
import { describe, it, expect } from 'vitest';
import {
  colors,
  spacing,
  spacingValues,
  fonts,
  fontSizes,
  fontSizeValues,
  fontWeights,
  lineHeights,
  typography,
  radius,
  radiusValues,
  shadows,
  transitions,
  durations,
  tokens,
} from '@/styles/tokens';

describe('Design Tokens - Cores', () => {
  describe('Cores Primárias Lexato', () => {
    it('deve ter a cor primária Caribbean Green correta', () => {
      expect(colors.primary.DEFAULT).toBe('#00DEA5');
    });

    it('deve ter a cor hover correta', () => {
      expect(colors.primary.hover).toBe('#00C896');
    });

    it('deve ter a cor Paolo Veronese (dark) correta', () => {
      expect(colors.primary.dark).toBe('#009978');
    });

    it('deve ter a cor Sherwood Green (darker) correta', () => {
      expect(colors.primary.darker).toBe('#064033');
    });
  });

  describe('Cores de Background (Dark Mode)', () => {
    it('deve ter o fundo primário Onyx correto', () => {
      expect(colors.background.primary).toBe('#0F0E10');
    });

    it('deve ter o fundo secundário correto', () => {
      expect(colors.background.secondary).toBe('#121215');
    });

    it('deve ter o fundo terciário Vulcan correto', () => {
      expect(colors.background.tertiary).toBe('#161519');
    });

    it('deve ter o fundo elevado correto', () => {
      expect(colors.background.elevated).toBe('#1A1919');
    });
  });

  describe('Cores de Texto', () => {
    it('deve ter texto primário 100% opacidade', () => {
      expect(colors.text.primary).toBe('#F7F9FB');
    });

    it('deve ter texto secundário 70% opacidade', () => {
      expect(colors.text.secondary).toBe('rgba(247, 249, 251, 0.7)');
    });

    it('deve ter texto terciário 50% opacidade', () => {
      expect(colors.text.tertiary).toBe('rgba(247, 249, 251, 0.5)');
    });

    it('deve ter texto muted 40% opacidade', () => {
      expect(colors.text.muted).toBe('rgba(247, 249, 251, 0.4)');
    });

    it('deve ter placeholder 20% opacidade', () => {
      expect(colors.text.placeholder).toBe('rgba(255, 255, 255, 0.2)');
    });
  });

  describe('Cores de Status', () => {
    it('deve ter cor de sucesso verde Lexato', () => {
      expect(colors.status.success).toBe('#00DEA5');
    });

    it('deve ter cor de erro vermelha', () => {
      expect(colors.status.error).toBe('#EF5350');
    });

    it('deve ter cor de warning âmbar', () => {
      expect(colors.status.warning).toBe('#FFA726');
    });

    it('deve ter cor de info verde escuro', () => {
      expect(colors.status.info).toBe('#009978');
    });

    it('deve ter cor de pending amarela', () => {
      expect(colors.status.pending).toBe('#FFCA28');
    });

    it('deve ter cor de processing azul', () => {
      expect(colors.status.processing).toBe('#42A5F5');
    });
  });

  describe('Cores Glass', () => {
    it('deve ter background glass correto', () => {
      expect(colors.glass.background).toBe('rgba(45, 52, 54, 0.3)');
    });

    it('deve ter borda glass correta', () => {
      expect(colors.glass.border).toBe('rgba(255, 255, 255, 0.08)');
    });

    it('deve ter borda ativa verde Lexato', () => {
      expect(colors.glass.borderActive).toBe('rgba(0, 222, 165, 0.5)');
    });
  });
});

describe('Design Tokens - Espaçamento', () => {
  it('deve ter escala de 4px correta', () => {
    expect(spacing[0]).toBe('0px');
    expect(spacing[1]).toBe('4px');
    expect(spacing[2]).toBe('8px');
    expect(spacing[3]).toBe('12px');
    expect(spacing[4]).toBe('16px');
    expect(spacing[5]).toBe('20px');
    expect(spacing[6]).toBe('24px');
    expect(spacing[8]).toBe('32px');
    expect(spacing[10]).toBe('40px');
    expect(spacing[12]).toBe('48px');
  });

  it('deve ter valores numéricos correspondentes', () => {
    expect(spacingValues[1]).toBe(4);
    expect(spacingValues[4]).toBe(16);
    expect(spacingValues[8]).toBe(32);
    expect(spacingValues[12]).toBe(48);
  });

  it('deve seguir múltiplos de 4', () => {
    Object.values(spacingValues).forEach((value) => {
      expect(value % 4).toBe(0);
    });
  });
});

describe('Design Tokens - Tipografia', () => {
  describe('Fontes', () => {
    it('deve ter Inter como fonte principal', () => {
      expect(fonts.sans).toContain('Inter');
    });

    it('deve ter JetBrains Mono como fonte mono', () => {
      expect(fonts.mono).toContain('JetBrains Mono');
    });
  });

  describe('Tamanhos de Fonte', () => {
    it('deve ter escala de 11px a 20px', () => {
      expect(fontSizes.xs).toBe('11px');
      expect(fontSizes.sm).toBe('12px');
      expect(fontSizes.base).toBe('13px');
      expect(fontSizes.md).toBe('14px');
      expect(fontSizes.lg).toBe('16px');
      expect(fontSizes.xl).toBe('18px');
      expect(fontSizes['2xl']).toBe('20px');
    });

    it('deve ter valores numéricos correspondentes', () => {
      expect(fontSizeValues.xs).toBe(11);
      expect(fontSizeValues.md).toBe(14);
      expect(fontSizeValues['2xl']).toBe(20);
    });
  });

  describe('Pesos de Fonte', () => {
    it('deve ter pesos 400, 500, 600, 700', () => {
      expect(fontWeights.normal).toBe('400');
      expect(fontWeights.medium).toBe('500');
      expect(fontWeights.semibold).toBe('600');
      expect(fontWeights.bold).toBe('700');
    });
  });

  describe('Alturas de Linha', () => {
    it('deve ter line-heights de 1.2 a 1.5', () => {
      expect(lineHeights.tight).toBe('1.2');
      expect(lineHeights.snug).toBe('1.3');
      expect(lineHeights.normal).toBe('1.4');
      expect(lineHeights.relaxed).toBe('1.5');
    });
  });

  describe('Presets Tipográficos', () => {
    it('deve ter preset H1 correto', () => {
      expect(typography.h1.fontSize).toBe('20px');
      expect(typography.h1.fontWeight).toBe('700');
      expect(typography.h1.lineHeight).toBe('1.2');
    });

    it('deve ter preset body correto', () => {
      expect(typography.body.fontSize).toBe('14px');
      expect(typography.body.fontWeight).toBe('400');
      expect(typography.body.lineHeight).toBe('1.5');
    });
  });
});

describe('Design Tokens - Border Radius', () => {
  it('deve ter escala de radius correta', () => {
    expect(radius.sm).toBe('6px');
    expect(radius.md).toBe('8px');
    expect(radius.lg).toBe('12px');
    expect(radius.xl).toBe('16px');
    expect(radius['2xl']).toBe('24px');
    expect(radius.full).toBe('9999px');
  });

  it('deve ter valores numéricos correspondentes', () => {
    expect(radiusValues.sm).toBe(6);
    expect(radiusValues.lg).toBe(12);
    expect(radiusValues.full).toBe(9999);
  });
});

describe('Design Tokens - Sombras', () => {
  it('deve ter sombras de elevação', () => {
    expect(shadows.sm).toContain('rgba(0, 0, 0');
    expect(shadows.md).toContain('rgba(0, 0, 0');
    expect(shadows.lg).toContain('rgba(0, 0, 0');
  });

  it('deve ter glows com cor verde Lexato', () => {
    expect(shadows.glow).toContain('rgba(0, 222, 165');
    expect(shadows.glowSm).toContain('rgba(0, 222, 165');
    expect(shadows.glowLg).toContain('rgba(0, 222, 165');
  });

  it('deve ter sombra glass', () => {
    expect(shadows.glass).toBeDefined();
  });
});

describe('Design Tokens - Transições', () => {
  it('deve ter durações corretas', () => {
    expect(transitions.fast).toContain('150ms');
    expect(transitions.base).toContain('200ms');
    expect(transitions.slow).toContain('300ms');
    expect(transitions.smooth).toContain('400ms');
  });

  it('deve ter valores numéricos de duração', () => {
    expect(durations.fast).toBe(150);
    expect(durations.base).toBe(200);
    expect(durations.slow).toBe(300);
    expect(durations.smooth).toBe(400);
  });

  it('deve ter easing smooth com cubic-bezier', () => {
    expect(transitions.smooth).toContain('cubic-bezier');
  });
});

describe('Design Tokens - Exportação Consolidada', () => {
  it('deve exportar objeto tokens com todos os valores', () => {
    expect(tokens.colors).toBeDefined();
    expect(tokens.spacing).toBeDefined();
    expect(tokens.fonts).toBeDefined();
    expect(tokens.fontSizes).toBeDefined();
    expect(tokens.fontWeights).toBeDefined();
    expect(tokens.lineHeights).toBeDefined();
    expect(tokens.radius).toBeDefined();
    expect(tokens.shadows).toBeDefined();
    expect(tokens.transitions).toBeDefined();
  });

  it('deve ter cores primárias no objeto consolidado', () => {
    expect(tokens.colors.primary.DEFAULT).toBe('#00DEA5');
  });
});
