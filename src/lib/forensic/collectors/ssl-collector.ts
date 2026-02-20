/**
 * SSLCollector - Coleta dados de SSL/TLS
 *
 * NOTA: Este collector usa document.querySelectorAll para verificar mixed content.
 * Se executado em service worker, pula a verificação de mixed content.
 *
 * @module SSLCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { SSLCertificateInfo } from '../../../types/forensic-metadata.types';

/**
 * Verifica se temos acesso ao DOM
 */
function hasDOMAccess(): boolean {
  return typeof document !== 'undefined';
}

/**
 * Coletor de informações SSL/TLS da conexão
 *
 * Nota: Navegadores não expõem detalhes completos do certificado via JavaScript.
 * Para informações completas, seria necessário uma API backend.
 */
export class SSLCollector extends BaseCollector<SSLCertificateInfo> {
  private url: string;

  constructor(logger: AuditLogger, url: string, timeout = 3000) {
    super(logger, 'ssl', timeout);
    this.url = url;
  }

  protected async doCollect(): Promise<SSLCertificateInfo> {
    const parsedUrl = new URL(this.url);
    const isSecure = parsedUrl.protocol === 'https:';

    const ssl: SSLCertificateInfo = {
      isSecure,
    };

    if (isSecure) {
      ssl.protocol = 'TLS';

      // Verifica se há mixed content (apenas se tiver acesso ao DOM)
      if (hasDOMAccess()) {
        ssl.isValid = this.checkMixedContent();
      } else {
        // Sem DOM, assumir válido (verificação será feita via API)
        ssl.isValid = true;
      }
    }

    return ssl;
  }

  /**
   * Verifica se há mixed content na página (recursos HTTP em página HTTPS)
   */
  private checkMixedContent(): boolean {
    // Verificação de segurança - não deve ser chamado sem DOM
    if (!hasDOMAccess()) {
      return true;
    }
    
    // Se a página é HTTPS, verifica se todos os recursos também são HTTPS
    const insecureResources = document.querySelectorAll(
      'script[src^="http:"], link[href^="http:"], img[src^="http:"], iframe[src^="http:"]'
    );

    return insecureResources.length === 0;
  }
}

export default SSLCollector;
