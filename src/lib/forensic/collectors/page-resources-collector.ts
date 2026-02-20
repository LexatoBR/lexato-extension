/**
 * PageResourcesCollector - Coleta recursos da página
 *
 * NOTA: Este collector usa document.querySelectorAll e window.location.
 * Se executado em service worker (sem DOM), retorna resultado vazio.
 * A coleta completa ocorre apenas no content script.
 *
 * @module PageResourcesCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { PageResourcesSummary, PageResource } from '../../../types/forensic-metadata.types';

/**
 * Verifica se temos acesso ao DOM
 */
function hasDOMAccess(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

/**
 * Coletor de recursos carregados pela página
 */
export class PageResourcesCollector extends BaseCollector<PageResourcesSummary> {
  private includeDetails: boolean;

  constructor(logger: AuditLogger, includeDetails = false, timeout = 3000) {
    super(logger, 'pageResources', timeout);
    this.includeDetails = includeDetails;
  }

  protected async doCollect(): Promise<PageResourcesSummary> {
    // Verifica se temos acesso ao DOM antes de tentar coletar
    if (!hasDOMAccess()) {
      this.logger.warn('FORENSIC', 'pageResources.noDOMAccess', {
        motivo: 'Executando em service worker sem acesso ao DOM',
      });
      return {
        scriptsCount: 0,
        stylesheetsCount: 0,
        imagesCount: 0,
        fontsCount: 0,
        mediaCount: 0,
        totalSizeBytes: 0,
        thirdPartyCount: 0,
      };
    }

    const domain = window.location.hostname;

    const summary: PageResourcesSummary = {
      scriptsCount: 0,
      stylesheetsCount: 0,
      imagesCount: 0,
      fontsCount: 0,
      mediaCount: 0,
      totalSizeBytes: 0,
      thirdPartyCount: 0,
    };

    const resources: PageResource[] = [];

    // Coleta scripts
    this.collectScripts(summary, resources, domain);

    // Coleta stylesheets
    this.collectStylesheets(summary, resources, domain);

    // Coleta imagens
    this.collectImages(summary, resources, domain);

    // Coleta mídia (video/audio)
    this.collectMedia(summary, resources, domain);

    // Coleta fontes via Performance API
    this.collectFontsFromPerformance(summary, resources, domain);

    // Calcula tamanho total via Performance API
    this.calculateTotalSize(summary);

    // Adiciona detalhes se solicitado
    if (this.includeDetails && resources.length > 0) {
      summary.resources = resources;
    }

    return summary;
  }

  /**
   * Coleta scripts da página
   */
  private collectScripts(
    summary: PageResourcesSummary,
    resources: PageResource[],
    domain: string
  ): void {
    document.querySelectorAll('script[src]').forEach((el) => {
      const src = el.getAttribute('src');
      if (!src) {
        return;
      }

      summary.scriptsCount++;
      const isThirdParty = !this.isSameDomain(src, domain);
      if (isThirdParty) {
        summary.thirdPartyCount++;
      }

      if (this.includeDetails) {
        resources.push({
          url: this.resolveUrl(src),
          type: 'script',
          loaded: true,
          isThirdParty,
        });
      }
    });
  }

  /**
   * Coleta stylesheets da página
   */
  private collectStylesheets(
    summary: PageResourcesSummary,
    resources: PageResource[],
    domain: string
  ): void {
    document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
      const href = el.getAttribute('href');
      if (!href) {
        return;
      }

      summary.stylesheetsCount++;
      const isThirdParty = !this.isSameDomain(href, domain);
      if (isThirdParty) {
        summary.thirdPartyCount++;
      }

      if (this.includeDetails) {
        resources.push({
          url: this.resolveUrl(href),
          type: 'stylesheet',
          loaded: true,
          isThirdParty,
        });
      }
    });
  }

  /**
   * Coleta imagens da página
   */
  private collectImages(
    summary: PageResourcesSummary,
    resources: PageResource[],
    domain: string
  ): void {
    document.querySelectorAll('img[src]').forEach((el) => {
      const src = el.getAttribute('src');
      if (!src || src.startsWith('data:')) {
        return;
      }

      summary.imagesCount++;
      const isThirdParty = !this.isSameDomain(src, domain);
      if (isThirdParty) {
        summary.thirdPartyCount++;
      }

      if (this.includeDetails) {
        const img = el as HTMLImageElement;
        resources.push({
          url: this.resolveUrl(src),
          type: 'image',
          loaded: img.complete && img.naturalWidth > 0,
          isThirdParty,
        });
      }
    });
  }

  /**
   * Coleta elementos de mídia (video/audio)
   */
  private collectMedia(
    summary: PageResourcesSummary,
    resources: PageResource[],
    domain: string
  ): void {
    document.querySelectorAll('video[src], audio[src], video source[src], audio source[src]').forEach((el) => {
      const src = el.getAttribute('src');
      if (!src) {
        return;
      }

      summary.mediaCount++;
      const isThirdParty = !this.isSameDomain(src, domain);
      if (isThirdParty) {
        summary.thirdPartyCount++;
      }

      if (this.includeDetails) {
        resources.push({
          url: this.resolveUrl(src),
          type: 'media',
          loaded: true,
          isThirdParty,
        });
      }
    });
  }

  /**
   * Coleta fontes via Performance API
   */
  private collectFontsFromPerformance(
    summary: PageResourcesSummary,
    resources: PageResource[],
    domain: string
  ): void {
    if (!performance.getEntriesByType) {
      return;
    }

    const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

    resourceEntries.forEach((entry) => {
      if (entry.initiatorType === 'css' && /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(entry.name)) {
        summary.fontsCount++;
        const isThirdParty = !this.isSameDomain(entry.name, domain);
        if (isThirdParty) {
          summary.thirdPartyCount++;
        }

        if (this.includeDetails) {
          resources.push({
            url: entry.name,
            type: 'font',
            size: entry.transferSize,
            loadTimeMs: entry.duration,
            loaded: true,
            isThirdParty,
          });
        }
      }
    });
  }

  /**
   * Calcula tamanho total dos recursos via Performance API
   */
  private calculateTotalSize(summary: PageResourcesSummary): void {
    if (!performance.getEntriesByType) {
      return;
    }

    const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    summary.totalSizeBytes = resourceEntries.reduce(
      (total, entry) => total + (entry.transferSize ?? 0),
      0
    );
  }

  /**
   * Verifica se URL pertence ao mesmo domínio
   */
  private isSameDomain(url: string, domain: string): boolean {
    try {
      const hostname = new URL(url, window.location.origin).hostname;
      return hostname === domain || hostname.endsWith(`.${domain}`);
    } catch {
      return true;
    }
  }

  /**
   * Resolve URL relativa para absoluta
   */
  private resolveUrl(url: string): string {
    try {
      return new URL(url, window.location.origin).href;
    } catch {
      return url;
    }
  }
}

export default PageResourcesCollector;
