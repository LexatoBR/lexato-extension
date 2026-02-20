/**
 * Tipos para Cloudflare Turnstile
 * 
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */

interface TurnstileOptions {
  /** Chave do site Turnstile */
  sitekey: string;
  /** Callback quando token é gerado */
  callback?: (token: string) => void;
  /** Callback quando ocorre erro */
  'error-callback'?: () => void;
  /** Callback quando token expira */
  'expired-callback'?: () => void;
  /** Tema do widget */
  theme?: 'light' | 'dark' | 'auto';
  /** Tamanho do widget */
  size?: 'normal' | 'compact' | 'invisible';
  /** Idioma do widget */
  language?: string;
  /** Ação para analytics */
  action?: string;
  /** Dados customizados */
  cData?: string;
  /** Retry automático */
  retry?: 'auto' | 'never';
  /** Intervalo de retry em ms */
  'retry-interval'?: number;
  /** Tempo de refresh em ms */
  'refresh-expired'?: 'auto' | 'manual' | 'never';
  /** Aparência */
  appearance?: 'always' | 'execute' | 'interaction-only';
}

interface TurnstileInstance {
  /** Renderiza o widget */
  render: (container: HTMLElement | string, options: TurnstileOptions) => string;
  /** Reseta o widget */
  reset: (widgetId?: string) => void;
  /** Remove o widget */
  remove: (widgetId: string) => void;
  /** Obtém a resposta (token) */
  getResponse: (widgetId?: string) => string | undefined;
  /** Verifica se está pronto */
  isExpired: (widgetId?: string) => boolean;
  /** Executa o desafio (para modo invisível) */
  execute: (container?: HTMLElement | string, options?: TurnstileOptions) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileInstance;
  }
}

export {};
