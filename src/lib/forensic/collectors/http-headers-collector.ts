/**
 * HTTPHeadersCollector - Coleta headers HTTP da página
 *
 * Obtém headers de segurança e metadados da resposta HTTP.
 *
 * @module HTTPHeadersCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { HTTPHeadersInfo } from '../../../types/forensic-metadata.types';

/**
 * Coletor de headers HTTP
 *
 * Faz requisição HEAD para a URL capturada e coleta headers de segurança.
 * A extensão tem host_permissions para <all_urls>, então pode acessar qualquer domínio.
 * Se o fetch falhar (CORS, timeout, etc.), usa Performance API como fallback.
 */
export class HTTPHeadersCollector extends BaseCollector<HTTPHeadersInfo> {
  private url: string;

  constructor(logger: AuditLogger, url: string, timeout = 5000) {
    super(logger, 'http-headers', timeout);
    this.url = url;
  }

  protected async doCollect(): Promise<HTTPHeadersInfo> {
    const result: HTTPHeadersInfo = {};

    try {
      // Faz requisição HEAD para obter headers sem baixar conteúdo
      const response = await fetch(this.url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.timeout - 1000),
        credentials: 'omit',
        cache: 'no-store',
      });

      const headers = response.headers;
      const allHeaders: Record<string, string> = {};

      // Coleta todos os headers
      headers.forEach((value, key) => {
        allHeaders[key.toLowerCase()] = value;
      });

      result.allHeaders = allHeaders;

      // Headers específicos de interesse
      const server = headers.get('server');
      if (server) {
        result.server = server;
      }

      const contentType = headers.get('content-type');
      if (contentType) {
        result.contentType = contentType;
      }

      const contentEncoding = headers.get('content-encoding');
      if (contentEncoding) {
        result.contentEncoding = contentEncoding;
      }

      const lastModified = headers.get('last-modified');
      if (lastModified) {
        result.lastModified = lastModified;
      }

      const etag = headers.get('etag');
      if (etag) {
        result.etag = etag;
      }

      const cacheControl = headers.get('cache-control');
      if (cacheControl) {
        result.cacheControl = cacheControl;
      }

      // Headers de segurança
      const csp = headers.get('content-security-policy');
      if (csp) {
        result.contentSecurityPolicy = csp;
      }

      const xFrameOptions = headers.get('x-frame-options');
      if (xFrameOptions) {
        result.xFrameOptions = xFrameOptions;
      }

      const xXssProtection = headers.get('x-xss-protection');
      if (xXssProtection) {
        result.xXssProtection = xXssProtection;
      }

      const xContentTypeOptions = headers.get('x-content-type-options');
      if (xContentTypeOptions) {
        result.xContentTypeOptions = xContentTypeOptions;
      }

      const referrerPolicy = headers.get('referrer-policy');
      if (referrerPolicy) {
        result.referrerPolicy = referrerPolicy;
      }

      const hsts = headers.get('strict-transport-security');
      if (hsts) {
        result.strictTransportSecurity = hsts;
      }
    } catch {
      // Se HEAD falhar, tenta obter headers via Performance API
      this.collectFromPerformanceAPI(result);
    }

    return result;
  }

  /**
   * Coleta headers disponíveis via Performance API (fallback)
   */
  private collectFromPerformanceAPI(result: HTTPHeadersInfo): void {
    try {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const navEntry = entries[0];

      if (navEntry) {
        // Performance API tem acesso limitado a headers, mas podemos inferir alguns dados
        const serverTiming = navEntry.serverTiming;
        if (serverTiming && serverTiming.length > 0) {
          result.allHeaders = result.allHeaders ?? {};
          result.allHeaders['x-server-timing'] = serverTiming
            .map((t) => `${t.name};dur=${t.duration}`)
            .join(', ');
        }
      }
    } catch {
      // Silencioso
    }
  }
}

export default HTTPHeadersCollector;
