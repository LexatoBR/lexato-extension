/**
 * Detector de Navegador Chromium
 *
 * Detecta qual navegador baseado em Chromium está sendo usado
 * para adaptar mensagens e comportamentos específicos.
 *
 * Navegadores suportados:
 * - Google Chrome
 * - Microsoft Edge
 * - Brave Browser
 * - Opera
 * - Vivaldi
 * - Arc
 * - Samsung Internet
 * - Outros baseados em Chromium
 *
 * @module BrowserDetector
 */

/**
 * Tipos de navegadores Chromium suportados
 */
export type BrowserType =
  | 'chrome'
  | 'edge'
  | 'brave'
  | 'opera'
  | 'vivaldi'
  | 'arc'
  | 'samsung'
  | 'chromium';

/**
 * Informações do navegador detectado
 */
export interface BrowserInfo {
  /** Tipo/identificador do navegador */
  type: BrowserType;
  /** Nome amigável para exibição */
  displayName: string;
  /** Prefixo de URL interna (ex: chrome://, edge://) */
  internalUrlPrefix: string;
  /** Nome do protocolo interno */
  protocolName: string;
}

/**
 * Mapeamento de navegadores com suas informações
 */
const BROWSER_INFO: Record<BrowserType, BrowserInfo> = {
  chrome: {
    type: 'chrome',
    displayName: 'Google Chrome',
    internalUrlPrefix: 'chrome://',
    protocolName: 'Chrome',
  },
  edge: {
    type: 'edge',
    displayName: 'Microsoft Edge',
    internalUrlPrefix: 'edge://',
    protocolName: 'Edge',
  },
  brave: {
    type: 'brave',
    displayName: 'Brave',
    internalUrlPrefix: 'brave://',
    protocolName: 'Brave',
  },
  opera: {
    type: 'opera',
    displayName: 'Opera',
    internalUrlPrefix: 'opera://',
    protocolName: 'Opera',
  },
  vivaldi: {
    type: 'vivaldi',
    displayName: 'Vivaldi',
    internalUrlPrefix: 'vivaldi://',
    protocolName: 'Vivaldi',
  },
  arc: {
    type: 'arc',
    displayName: 'Arc',
    internalUrlPrefix: 'arc://',
    protocolName: 'Arc',
  },
  samsung: {
    type: 'samsung',
    displayName: 'Samsung Internet',
    internalUrlPrefix: 'chrome://',
    protocolName: 'Samsung Internet',
  },
  chromium: {
    type: 'chromium',
    displayName: 'navegador',
    internalUrlPrefix: 'chrome://',
    protocolName: 'navegador',
  },
};

/** Cache do navegador detectado */
let cachedBrowser: BrowserInfo | null = null;

/**
 * Detecta o navegador atual baseado no User Agent e APIs disponíveis
 *
 * @returns Informações do navegador detectado
 */
export function detectBrowser(): BrowserInfo {
  // Retorna cache se já detectado
  if (cachedBrowser) {
    return cachedBrowser;
  }

  const ua = navigator.userAgent.toLowerCase();

  // Ordem de detecção importa - mais específicos primeiro

  // Brave tem API própria
  if ('brave' in navigator && typeof (navigator as { brave?: { isBrave?: () => Promise<boolean> } }).brave?.isBrave === 'function') {
    cachedBrowser = BROWSER_INFO.brave;
    return cachedBrowser;
  }

  // Edge (Chromium) - verificar antes do Chrome
  if (ua.includes('edg/') || ua.includes('edge/')) {
    cachedBrowser = BROWSER_INFO.edge;
    return cachedBrowser;
  }

  // Opera - verificar antes do Chrome
  if (ua.includes('opr/') || ua.includes('opera')) {
    cachedBrowser = BROWSER_INFO.opera;
    return cachedBrowser;
  }

  // Vivaldi
  if (ua.includes('vivaldi')) {
    cachedBrowser = BROWSER_INFO.vivaldi;
    return cachedBrowser;
  }

  // Arc (baseado em Chrome, mas tem identificador)
  if (ua.includes('arc/')) {
    cachedBrowser = BROWSER_INFO.arc;
    return cachedBrowser;
  }

  // Samsung Internet
  if (ua.includes('samsungbrowser')) {
    cachedBrowser = BROWSER_INFO.samsung;
    return cachedBrowser;
  }

  // Google Chrome (verificar por último entre os específicos)
  if (ua.includes('chrome') && !ua.includes('chromium')) {
    cachedBrowser = BROWSER_INFO.chrome;
    return cachedBrowser;
  }

  // Chromium genérico ou desconhecido
  cachedBrowser = BROWSER_INFO.chromium;
  return cachedBrowser;
}

/**
 * Obtém o nome do navegador para exibição em mensagens
 *
 * @returns Nome amigável do navegador
 */
export function getBrowserDisplayName(): string {
  return detectBrowser().displayName;
}

/**
 * Obtém o nome do protocolo interno do navegador
 *
 * @returns Nome do protocolo (ex: "Chrome", "Edge", "Brave")
 */
export function getBrowserProtocolName(): string {
  return detectBrowser().protocolName;
}

/**
 * Substitui placeholders de navegador em uma string
 *
 * Placeholders suportados:
 * - {browser} - Nome completo do navegador (ex: "Google Chrome")
 * - {browserShort} - Nome curto/protocolo (ex: "Chrome")
 *
 * @param text - Texto com placeholders
 * @returns Texto com placeholders substituídos
 */
export function replaceBrowserPlaceholders(text: string): string {
  const browser = detectBrowser();
  return text
    .replace(/\{browser\}/g, browser.displayName)
    .replace(/\{browserShort\}/g, browser.protocolName);
}

/**
 * Verifica se o navegador atual é um específico
 *
 * @param browserType - Tipo de navegador a verificar
 * @returns true se o navegador atual é do tipo especificado
 */
export function isBrowser(browserType: BrowserType): boolean {
  return detectBrowser().type === browserType;
}

