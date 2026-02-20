/**
 * Utilitário para verificação de URLs bloqueadas para captura
 *
 * Impede capturas em páginas internas do navegador, páginas da Lexato
 * e outras URLs que não devem ser capturadas por razões técnicas ou de segurança.
 *
 * Adapta mensagens automaticamente para o navegador em uso:
 * - Google Chrome, Microsoft Edge, Brave, Opera, Vivaldi, Arc, etc.
 *
 * @module BlockedUrls
 */

import { getBrowserProtocolName } from './browser-detector';

/**
 * Padrões de URLs bloqueadas para captura
 *
 * Inclui:
 * - Páginas internas do navegador (chrome://, edge://, brave://, etc.)
 * - Páginas do navegador (about:)
 * - Páginas da Lexato (não faz sentido capturar a própria plataforma)
 * - Páginas de extensões e configurações
 */
const BLOCKED_URL_PATTERNS: RegExp[] = [
  // Páginas internas do navegador (Chromium e derivados)
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^chrome-search:\/\//i,
  /^chrome-devtools:\/\//i,

  // Páginas internas de outros navegadores Chromium
  /^about:/i,
  /^edge:\/\//i,
  /^brave:\/\//i,
  /^opera:\/\//i,
  /^vivaldi:\/\//i,
  /^arc:\/\//i,
  /^firefox:\/\//i,

  // Páginas de extensões genéricas
  /^moz-extension:\/\//i,
  /^extension:\/\//i,

  // Páginas especiais
  /^view-source:/i,
  /^data:/i,
  /^blob:/i,
  /^javascript:/i,
  /^file:\/\//i,

  // Chrome Web Store (Content scripts são bloqueados aqui)
  /^https:\/\/chromewebstore\.google\.com/i,
  /^https:\/\/chrome\.google\.com\/webstore/i,

  // Páginas da Lexato (não capturar a própria plataforma)
  /^https?:\/\/(www\.)?lexato\.com\.br/i,
  /^https?:\/\/(www\.)?lexato\.app/i,
  /^https?:\/\/app\.lexato\.com\.br/i,
  // Dashboard removido em favor de app.lexato.com.br
  /^https?:\/\/api\.lexato\.com\.br/i,

  // Ambientes de desenvolvimento/staging da Lexato
  /^https?:\/\/.*\.lexato\.com\.br/i,
  /^https?:\/\/localhost.*lexato/i,
];

/**
 * Resultado da verificação de URL bloqueada
 */
export interface VerificacaoUrlBloqueada {
  /** Se a URL está bloqueada */
  bloqueada: boolean;
  /** Motivo do bloqueio (se bloqueada) */
  motivo?: string;
  /** Categoria do bloqueio */
  categoria?: 'chrome' | 'navegador' | 'extensao' | 'lexato' | 'especial';
}

/**
 * Verifica se uma URL está bloqueada para captura
 *
 * @param url - URL a ser verificada
 * @returns Objeto com status de bloqueio e motivo
 */
export function verificarUrlBloqueada(url: string | undefined | null): VerificacaoUrlBloqueada {
  // URL vazia ou inválida
  if (!url || typeof url !== 'string') {
    return {
      bloqueada: true,
      motivo: 'URL inválida ou não disponível',
      categoria: 'especial',
    };
  }

  const urlLower = url.toLowerCase();

  // Verificar páginas internas do navegador (chrome://, edge://, brave://, etc.)
  if (urlLower.startsWith('chrome://') || urlLower.startsWith('chrome-')) {
    const browserName = getBrowserProtocolName();
    return {
      bloqueada: true,
      motivo: `Páginas internas do ${browserName} não podem ser capturadas`,
      categoria: 'chrome',
    };
  }

  // Verificar páginas de outros navegadores (edge://, brave://, opera://, etc.)
  if (
    urlLower.startsWith('about:') ||
    urlLower.startsWith('edge://') ||
    urlLower.startsWith('brave://') ||
    urlLower.startsWith('opera://') ||
    urlLower.startsWith('vivaldi://') ||
    urlLower.startsWith('arc://') ||
    urlLower.startsWith('firefox://')
  ) {
    const browserName = getBrowserProtocolName();
    return {
      bloqueada: true,
      motivo: `Páginas internas do ${browserName} não podem ser capturadas`,
      categoria: 'navegador',
    };
  }

  // Verificar páginas de extensões
  if (
    urlLower.startsWith('chrome-extension://') ||
    urlLower.startsWith('moz-extension://') ||
    urlLower.startsWith('extension://')
  ) {
    return {
      bloqueada: true,
      motivo: 'Páginas de extensões não podem ser capturadas',
      categoria: 'extensao',
    };
  }

  // Verificar páginas especiais
  if (
    urlLower.startsWith('view-source:') ||
    urlLower.startsWith('data:') ||
    urlLower.startsWith('blob:') ||
    urlLower.startsWith('javascript:') ||
    urlLower.startsWith('file://')
  ) {
    return {
      bloqueada: true,
      motivo: 'Este tipo de página não pode ser capturado',
      categoria: 'especial',
    };
  }

  // Verificar páginas da Lexato
  if (BLOCKED_URL_PATTERNS.some((pattern) => pattern.test(url))) {
    // Verificar especificamente se é Lexato
    if (/lexato/i.test(url)) {
      return {
        bloqueada: true,
        motivo: 'Páginas da Lexato não podem ser capturadas',
        categoria: 'lexato',
      };
    }
  }

  // URL permitida
  return {
    bloqueada: false,
  };
}

/**
 * Verifica se a URL é válida para captura (inverso de bloqueada)
 *
 * @param url - URL a ser verificada
 * @returns true se a URL pode ser capturada
 */
export function isUrlCapturavel(url: string | undefined | null): boolean {
  return !verificarUrlBloqueada(url).bloqueada;
}

/**
 * Obtém mensagem de erro amigável para URL bloqueada
 *
 * @param url - URL bloqueada
 * @returns Mensagem de erro formatada para exibição ao usuário
 */
export function getMensagemUrlBloqueada(url: string | undefined | null): string {
  const verificacao = verificarUrlBloqueada(url);

  if (!verificacao.bloqueada) {
    return '';
  }

  return verificacao.motivo ?? 'Esta página não pode ser capturada';
}
