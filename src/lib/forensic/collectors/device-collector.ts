/**
 * DeviceCollector - Coleta dados do dispositivo
 *
 * NOTA: Este collector usa APIs que podem não estar disponíveis no Service Worker
 * (window, screen). Quando executado no SW, retorna dados parciais baseados
 * apenas no navigator.
 *
 * @module DeviceCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { DeviceInfo } from '../../../types/forensic-metadata.types';

/**
 * Verifica se temos acesso ao objeto window (não disponível em Service Worker)
 */
function hasWindowAccess(): boolean {
  return typeof window !== 'undefined' && typeof screen !== 'undefined';
}

/**
 * Coletor de informações detalhadas do dispositivo
 */
export class DeviceCollector extends BaseCollector<DeviceInfo> {
  constructor(logger: AuditLogger, timeout = 3000) {
    super(logger, 'device', timeout);
  }

  protected async doCollect(): Promise<DeviceInfo> {
    const ua = navigator.userAgent;
    const browserInfo = this.parseBrowserInfo(ua);
    const hasWindow = hasWindowAccess();

    // Dados básicos disponíveis em qualquer contexto (incluindo Service Worker)
    const device: DeviceInfo = {
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
      // Dados de tela - só disponíveis com window/screen
      screenResolution: hasWindow ? `${screen.width}x${screen.height}` : 'unavailable',
      colorDepth: hasWindow ? screen.colorDepth : 0,
      devicePixelRatio: hasWindow ? (window.devicePixelRatio ?? 1) : 1,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
      language: navigator.language,
      languages: [...navigator.languages],
      // Touch support - só disponível com window
      touchSupport: hasWindow ? ('ontouchstart' in window || navigator.maxTouchPoints > 0) : false,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      onLine: navigator.onLine,
      vendor: navigator.vendor,
      browserVersion: browserInfo.version,
      browserName: browserInfo.name,
      cookieEnabled: navigator.cookieEnabled,
      plugins: this.getPluginNames(),
    };

    // Campos opcionais
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof mem === 'number') {
      device.deviceMemory = mem;
    }

    // Screen orientation - só disponível com screen
    if (hasWindow) {
      const orient = screen.orientation?.type;
      if (orient) {
        device.screenOrientation = orient;
      }
    }

    const dnt = navigator.doNotTrack;
    if (dnt) {
      device.doNotTrack = dnt;
    }

    // PDF viewer
    if ('pdfViewerEnabled' in navigator) {
      device.pdfViewerEnabled = (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
    }

    return device;
  }

  /**
   * Extrai informações do navegador do User-Agent
   */
  private parseBrowserInfo(ua: string): { name: string; version: string } {
    // Chrome
    const chromeMatch = ua.match(/Chrome\/(\d+\.\d+)/);
    if (chromeMatch?.[1] && !ua.includes('Edg/')) {
      return { name: 'Chrome', version: chromeMatch[1] };
    }

    // Edge
    const edgeMatch = ua.match(/Edg\/(\d+\.\d+)/);
    if (edgeMatch?.[1]) {
      return { name: 'Edge', version: edgeMatch[1] };
    }

    // Firefox
    const firefoxMatch = ua.match(/Firefox\/(\d+\.\d+)/);
    if (firefoxMatch?.[1]) {
      return { name: 'Firefox', version: firefoxMatch[1] };
    }

    // Safari
    const safariMatch = ua.match(/Version\/(\d+\.\d+).*Safari/);
    if (safariMatch?.[1]) {
      return { name: 'Safari', version: safariMatch[1] };
    }

    return { name: 'unknown', version: 'unknown' };
  }

  /**
   * Obtém lista de plugins instalados
   */
  private getPluginNames(): string[] {
    try {
      return Array.from(navigator.plugins)
        .map((p) => p.name)
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}

export default DeviceCollector;
