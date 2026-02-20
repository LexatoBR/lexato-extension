/**
 * Design Tokens - Cores do Design System Lexato
 *
 * Cores oficiais da marca Lexato adaptadas para a extensão Chrome.
 * Baseado nos protótipos Google Stitch com paleta dark mode.
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.4
 */

/**
 * Cores primárias da marca Lexato
 */
export const colors = {
  /**
   * Cores primárias - Verde Lexato
   * Usadas para CTAs, destaques e elementos interativos
   */
  primary: {
    /** Caribbean Green - CTAs principais, destaques */
    DEFAULT: '#00DEA5',
    /** Hover state para elementos primários */
    hover: '#00C896',
    /** Paolo Veronese - Links, elementos secundários */
    dark: '#009978',
    /** Sherwood Green - Backgrounds de destaque */
    darker: '#064033',
  },

  /**
   * Cores de fundo (Dark Mode)
   * Gradiente de escuros para hierarquia visual
   */
  background: {
    /** Onyx - Fundo principal da extensão */
    primary: '#0F0E10',
    /** Via gradient - Transição intermediária */
    secondary: '#121215',
    /** Vulcan - Cards, containers */
    tertiary: '#161519',
    /** Menus, popovers, elementos elevados */
    elevated: '#1A1919',
  },

  /**
   * Cores de texto com opacidades
   * Hierarquia tipográfica através de opacidade
   */
  text: {
    /** 100% - Títulos e texto principal */
    primary: '#F7F9FB',
    /** 70% - Descrições e texto secundário */
    secondary: 'rgba(247, 249, 251, 0.7)',
    /** 50% - Placeholders e texto terciário */
    tertiary: 'rgba(247, 249, 251, 0.5)',
    /** 40% - Texto desabilitado */
    muted: 'rgba(247, 249, 251, 0.4)',
    /** 20% - Hints e dicas sutis */
    placeholder: 'rgba(255, 255, 255, 0.2)',
  },

  /**
   * Cores de status
   * Feedback visual para estados do sistema
   */
  status: {
    /** Verde Lexato - Sucesso, confirmação */
    success: '#00DEA5',
    /** Vermelho - Erro, falha */
    error: '#EF5350',
    /** Âmbar - Alerta, atenção */
    warning: '#FFA726',
    /** Verde escuro - Informação */
    info: '#009978',
    /** Amarelo - Pendente, aguardando */
    pending: '#FFCA28',
    /** Azul - Processando (único uso permitido de azul) */
    processing: '#42A5F5',
  },

  /**
   * Efeitos glassmorphism
   * Transparências e bordas para efeito glass
   */
  glass: {
    /** Background padrão de painéis glass */
    background: 'rgba(45, 52, 54, 0.3)',
    /** Background em hover */
    backgroundHover: 'rgba(45, 52, 54, 0.4)',
    /** Background claro para cards */
    backgroundLight: 'rgba(255, 255, 255, 0.03)',
    /** Borda padrão */
    border: 'rgba(255, 255, 255, 0.08)',
    /** Borda em hover */
    borderHover: 'rgba(255, 255, 255, 0.12)',
    /** Borda ativa (verde Lexato) */
    borderActive: 'rgba(0, 222, 165, 0.5)',
  },
} as const;

/** Tipo inferido das cores do Design System */
export type Colors = typeof colors;

/** Tipo para cores primárias */
export type PrimaryColors = keyof typeof colors.primary;

/** Tipo para cores de background */
export type BackgroundColors = keyof typeof colors.background;

/** Tipo para cores de texto */
export type TextColors = keyof typeof colors.text;

/** Tipo para cores de status */
export type StatusColors = keyof typeof colors.status;

/** Tipo para cores glass */
export type GlassColors = keyof typeof colors.glass;
