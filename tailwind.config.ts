import type { Config } from 'tailwindcss';

/**
 * Configuração do Tailwind CSS para a Extensão Chrome Lexato
 *
 * Design System baseado nos protótipos Google Stitch com paleta Lexato.
 * Tokens definidos inline para compatibilidade com processamento do Tailwind.
 *
 * DIMENSÕES DA EXTENSÃO:
 * - Largura: 520px
 * - Altura: 850px
 * - Sidebar: 70px
 * - Header: 64px
 *
 * PALETA OFICIAL LEXATO:
 * - Caribbean Green (#00DEA5): CTAs, destaques, sucesso
 * - Paolo Veronese (#009978): Links, hover, secundários
 * - Sherwood Green (#064033): Backgrounds de destaque
 * - Onyx (#0F0E10): Background principal
 * - Vulcan (#161519): Cards, containers
 * - White Lilac (#F7F9FB): Texto primário
 *
 * ⚠️ NUNCA USAR AZUL COMO COR DE DESTAQUE (exceto status.processing)
 *
 * @see Requirements 1.1-1.8, 2.1-2.5, 11.1-11.5
 */

/**
 * Design Tokens - Cores
 * Sincronizado com src/styles/tokens/colors.ts
 */
const colors = {
  primary: {
    DEFAULT: '#00DEA5',
    hover: '#00C896',
    dark: '#009978',
    darker: '#064033',
  },
  background: {
    primary: '#0F0E10',
    secondary: '#121215',
    tertiary: '#161519',
    elevated: '#1A1919',
  },
  text: {
    primary: '#F7F9FB',
    secondary: 'rgba(247, 249, 251, 0.7)',
    tertiary: 'rgba(247, 249, 251, 0.5)',
    muted: 'rgba(247, 249, 251, 0.4)',
    placeholder: 'rgba(255, 255, 255, 0.2)',
  },
  status: {
    success: '#00DEA5',
    error: '#EF5350',
    warning: '#FFA726',
    info: '#009978',
    pending: '#FFCA28',
    processing: '#42A5F5',
  },
  glass: {
    background: 'rgba(45, 52, 54, 0.3)',
    backgroundHover: 'rgba(45, 52, 54, 0.4)',
    backgroundLight: 'rgba(255, 255, 255, 0.03)',
    border: 'rgba(255, 255, 255, 0.08)',
    borderHover: 'rgba(255, 255, 255, 0.12)',
    borderActive: 'rgba(0, 222, 165, 0.5)',
  },
} as const;

/**
 * Design Tokens - Espaçamento (escala de 4px)
 * Sincronizado com src/styles/tokens/spacing.ts
 */
const spacing = {
  '0': '0px',
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '8': '32px',
  '10': '40px',
  '12': '48px',
} as const;

/**
 * Design Tokens - Tipografia
 * Sincronizado com src/styles/tokens/typography.ts
 */
const fonts = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
} as const;

const fontSizes = {
  xs: '11px',
  sm: '12px',
  base: '13px',
  md: '14px',
  lg: '16px',
  xl: '18px',
  '2xl': '20px',
} as const;

const lineHeights = {
  tight: '1.2',
  snug: '1.3',
  normal: '1.4',
  relaxed: '1.5',
} as const;

/**
 * Design Tokens - Border Radius
 * Sincronizado com src/styles/tokens/radius.ts
 */
const radius = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '24px',
  full: '9999px',
} as const;

/**
 * Design Tokens - Sombras
 * Sincronizado com src/styles/tokens/shadows.ts
 */
const shadows = {
  sm: '0 4px 12px rgba(0, 0, 0, 0.25)',
  md: '0 8px 24px rgba(0, 0, 0, 0.4)',
  lg: '0 16px 48px rgba(0, 0, 0, 0.5)',
  glow: '0 0 20px rgba(0, 222, 165, 0.4)',
  glowSm: '0 0 12px rgba(0, 222, 165, 0.3)',
  glowLg: '0 0 30px rgba(0, 222, 165, 0.5)',
  glass: '0 4px 30px rgba(0, 0, 0, 0.1)',
} as const;

/**
 * Design Tokens - Durações de transição
 * Sincronizado com src/styles/tokens/transitions.ts
 */
const durations = {
  fast: 150,
  base: 200,
  slow: 300,
  smooth: 400,
} as const;

const config: Config = {
  content: [
    './src/**/*.{ts,tsx,html}',
    './src/options/index.html',
  ],

  // Dark mode sempre ativo (class-based para consistência)
  darkMode: 'class',

  theme: {
    extend: {
      /**
       * Cores do Design System Lexato
       * @see Requirements 1.1, 1.2, 1.3, 1.4
       */
      colors: {
        // Cores primárias Lexato (Verde oficial)
        primary: {
          DEFAULT: colors.primary.DEFAULT,
          hover: colors.primary.hover,
          dark: colors.primary.dark,
          darker: colors.primary.darker,
        },

        // Cores de fundo (dark mode)
        background: {
          primary: colors.background.primary,
          secondary: colors.background.secondary,
          tertiary: colors.background.tertiary,
          elevated: colors.background.elevated,
        },

        // Cores de texto com opacidades
        text: {
          primary: colors.text.primary,
          secondary: colors.text.secondary,
          tertiary: colors.text.tertiary,
          muted: colors.text.muted,
          placeholder: colors.text.placeholder,
        },

        // Cores de status
        status: {
          success: colors.status.success,
          error: colors.status.error,
          warning: colors.status.warning,
          info: colors.status.info,
          pending: colors.status.pending,
          processing: colors.status.processing,
        },

        // Efeitos glassmorphism
        glass: {
          bg: colors.glass.background,
          bgHover: colors.glass.backgroundHover,
          bgLight: colors.glass.backgroundLight,
          border: colors.glass.border,
          borderHover: colors.glass.borderHover,
          borderActive: colors.glass.borderActive,
        },

        // Aliases para compatibilidade com código existente
        lexato: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: colors.primary.DEFAULT,
          500: colors.primary.dark,
          600: colors.primary.darker,
          700: '#053329',
          800: '#042620',
          900: '#031a15',
          950: '#020d0b',
        },

        dark: {
          50: colors.text.primary,
          100: '#e8eaed',
          200: '#c9cdd2',
          300: '#a3a9b0',
          400: '#7d858e',
          500: '#5a636d',
          600: '#3d444c',
          700: colors.background.elevated,
          800: colors.background.tertiary,
          900: colors.background.primary,
          950: '#080708',
        },

        success: {
          DEFAULT: colors.status.success,
          dark: colors.primary.dark,
        },
        warning: {
          DEFAULT: colors.status.warning,
          dark: '#F59E0B',
        },
        error: {
          DEFAULT: colors.status.error,
          dark: '#EF4444',
        },
        info: {
          DEFAULT: colors.status.info,
          dark: colors.primary.darker,
        },
      },

      /**
       * Fontes do Design System
       * @see Requirements 2.1, 2.2
       */
      fontFamily: {
        sans: [fonts.sans],
        mono: [fonts.mono],
      },

      /**
       * Tamanhos de fonte com line-heights
       * @see Requirements 2.3, 2.4, 2.5
       */
      fontSize: {
        xs: [fontSizes.xs, { lineHeight: lineHeights.snug }],
        sm: [fontSizes.sm, { lineHeight: lineHeights.normal }],
        base: [fontSizes.base, { lineHeight: lineHeights.relaxed }],
        md: [fontSizes.md, { lineHeight: lineHeights.relaxed }],
        lg: [fontSizes.lg, { lineHeight: lineHeights.normal }],
        xl: [fontSizes.xl, { lineHeight: lineHeights.snug }],
        '2xl': [fontSizes['2xl'], { lineHeight: lineHeights.tight }],
      },

      /**
       * Espaçamento baseado em escala de 4px
       * @see Requirements 1.5
       */
      spacing: {
        ...spacing,
        // Dimensões específicas da extensão
        'sidebar': '70px',
        'header': '64px',
        'content': '450px',
      },

      /**
       * Dimensões máximas do side panel
       */
      maxWidth: {
        'side-panel': '520px',
      },
      maxHeight: {
        'side-panel': '850px',
      },

      /**
       * Border radius do Design System
       * @see Requirements 1.6
       */
      borderRadius: {
        sm: radius.sm,
        md: radius.md,
        lg: radius.lg,
        xl: radius.xl,
        '2xl': radius['2xl'],
        full: radius.full,
      },

      /**
       * Sombras e glows do Design System
       * @see Requirements 1.7
       */
      boxShadow: {
        sm: shadows.sm,
        md: shadows.md,
        lg: shadows.lg,
        glow: shadows.glow,
        'glow-sm': shadows.glowSm,
        'glow-lg': shadows.glowLg,
        glass: shadows.glass,
        // Sombras compostas para estados específicos
        'card-hover': `${shadows.sm}, ${shadows.glowSm}`,
        'card-selected': `${shadows.glow}, inset 0 0 0 1px rgba(0, 222, 165, 0.3)`,
        'button-primary-hover': '0 6px 20px rgba(0, 222, 165, 0.4)',
        'input-focus': '0 0 25px rgba(0, 222, 165, 0.1)',
        'error': '0 0 15px rgba(239, 83, 80, 0.1)',
        // Aliases para compatibilidade
        'dark-sm': '0 1px 2px 0 rgb(0 0 0 / 0.3)',
        'dark-md': '0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3)',
        'dark-lg': '0 10px 15px -3px rgb(0 0 0 / 0.3), 0 4px 6px -4px rgb(0 0 0 / 0.3)',
        'dark-xl': '0 20px 25px -5px rgb(0 0 0 / 0.3), 0 8px 10px -6px rgb(0 0 0 / 0.3)',
      },

      /**
       * Durações de transição
       * @see Requirements 1.8
       */
      transitionDuration: {
        fast: `${durations.fast}ms`,
        base: `${durations.base}ms`,
        slow: `${durations.slow}ms`,
        smooth: `${durations.smooth}ms`,
      },

      /**
       * Animações do Design System
       * @see Requirements 11.1-11.5
       */
      animation: {
        'fade-in-scale': 'fadeInScale 300ms ease forwards',
        'slide-up': 'slideUp 300ms ease forwards',
        'pulse-glow': 'pulse-glow 4s ease-in-out infinite',
        'spin': 'spin 1s linear infinite',
        'pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shake': 'shake 0.5s ease-in-out',
        'indeterminate': 'indeterminate 1.5s ease-in-out infinite',
        'verified-glow': 'verifiedGlow 3s ease forwards',
        // Aliases para compatibilidade
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 2s linear infinite',
      },

      /**
       * Keyframes para animações
       * @see Requirements 11.1-11.5
       */
      keyframes: {
        fadeInScale: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.1)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
        },
        indeterminate: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        verifiedGlow: {
          '0%': { boxShadow: '0 0 20px rgba(0, 222, 165, 0.5)' },
          '100%': { boxShadow: 'none' },
        },
      },

      /**
       * Backdrop blur para efeitos glassmorphism
       */
      backdropBlur: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
      },
    },
  },

  plugins: [],
};

export default config;
