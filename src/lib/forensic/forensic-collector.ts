/**
 * ForensicCollector - Orquestrador de coleta de metadados forenses
 *
 * Coordena múltiplos coletores especializados para obter dados abrangentes
 * que fortalecem a validade jurídica das provas digitais.
 *
 * NOTA: Alguns coletores requerem acesso ao DOM (document) e só funcionam
 * em content scripts. No service worker, esses coletores retornam resultados
 * vazios/erro graciosamente (cada collector tem seu próprio guard interno).
 *
 * COLETORES DOM-REQUIRED (têm guards internos):
 * - SSLCollector: usa document.querySelectorAll para detectar mixed content
 * - PageResourcesCollector: usa document.querySelectorAll para listar recursos
 * - CanvasFingerprintCollector: usa document.createElement('canvas')
 * - WebGLFingerprintCollector: usa document.createElement('canvas')
 * - FontsCollector: usa document.fonts
 *
 * IMPORTANTE: Chrome Extension MV3 Service Workers NÃO suportam dynamic imports.
 * Conforme documentação oficial: "Note that import(), often called a dynamic import, is not supported."
 * @see https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics
 *
 * Por isso, TODOS os collectors são importados estaticamente. Os collectors DOM-required
 * têm guards internos que retornam resultados vazios quando executados sem DOM.
 *
 * @module ForensicCollector
 */

import { AuditLogger } from '../audit-logger';
import {
  DEFAULT_FORENSIC_CONFIG,
  DEFAULT_CONSENT_CONFIG,
  type ForensicMetadataLegacy,
  type ForensicCollectionConfig,
  type ForensicConsentConfig,
  type ForensicConsentInfo,
  type ForensicFingerprints,
  type CookieInfo,
  createForensicConsentInfo,
} from '../../types/forensic-metadata.types';

// Importar utilitário de detecção de contexto
import { hasDOMAccess, detectExecutionContext } from '../context-utils';

// ============================================================================
// Funções de Debug - Logging Extensivo para Diagnóstico
// ============================================================================


// ============================================================================
// Importações Estáticas de TODOS os Collectors
// ============================================================================
// IMPORTANTE: Chrome Extension MV3 Service Workers NÃO suportam dynamic imports.
// Todos os collectors são importados estaticamente. Os collectors DOM-required
// têm guards internos que retornam resultados vazios quando executados sem DOM.

// Collectors que NÃO requerem DOM (seguros para service worker):
import { GeolocationCollector } from './collectors/geolocation-collector';
import { NetworkCollector } from './collectors/network-collector';
import { DeviceCollector } from './collectors/device-collector';
import { DNSCollector } from './collectors/dns-collector';
import { StorageCollector } from './collectors/storage-collector';
import { PerformanceCollector } from './collectors/performance-collector';
import { WaybackCollector } from './collectors/wayback-collector';

import { HTTPHeadersCollector } from './collectors/http-headers-collector';
import { TimezoneCollector } from './collectors/timezone-collector';

import { MediaDevicesCollector } from './collectors/media-devices-collector';
import { ServiceWorkersCollector } from './collectors/service-workers-collector';
import { PermissionsCollector } from './collectors/permissions-collector';
// Serviço unificado de consulta de domínio com fallback WhoisFreaks -> WhoisXML
import { DomainLookupService } from './services/domain-lookup-service';

// Collectors que REQUEREM DOM (têm guards internos que retornam erro graciosamente):
// Importados estaticamente porque dynamic import() não é suportado em Service Workers MV3
import { SSLCollector } from './collectors/ssl-collector';
import { PageResourcesCollector } from './collectors/page-resources-collector';
import { CanvasFingerprintCollector } from './collectors/canvas-fingerprint-collector';
import { WebGLFingerprintCollector } from './collectors/webgl-fingerprint-collector';
import { FontsCollector } from './collectors/fonts-collector';

/**
 * Tipo de retorno do ForensicCollector.collect()
 * Inclui consent info para rastreabilidade LGPD/GDPR
 */
export type ForensicMetadataWithConsent = ForensicMetadataLegacy & {
  consent: ForensicConsentInfo;
  fingerprintsGrouped?: ForensicFingerprints;
};

/**
 * Parâmetros para coleta de metadados forenses
 */
export interface ForensicCollectParams {
  captureId: string;
  url: string;
  title: string;
  viewport: { width: number; height: number };
  pageSize: { width: number; height: number };
  viewportsCaptured: number;
  imageHash?: string;
  htmlHash?: string;
}

/**
 * Lista de coletores que requerem DOM e são pulados em service worker
 */
const DOM_REQUIRED_COLLECTORS = [
  'ssl-mixed-content',
  'page-resources',
  'canvas-fingerprint',
  'webgl-fingerprint',
  'fonts',
] as const;

/**
 * Orquestrador de coleta de metadados forenses
 *
 * Coordena múltiplos coletores especializados para obter dados abrangentes
 * que fortalecem a validade jurídica das provas digitais.
 *
 * Suporta sistema de consentimento LGPD/GDPR para coleta condicional
 * de dados opcionais (fingerprints, geolocalização precisa).
 *
 * @requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */
export class ForensicCollector {
  private logger: AuditLogger;
  private config: ForensicCollectionConfig;
  private consentConfig: ForensicConsentConfig;
  /** Logger com contexto da coleta atual */
  private collectionLogger: AuditLogger | null = null;

  /**
   * Cria instância do ForensicCollector
   *
   * @param logger - Logger para auditoria
   * @param config - Configuração de coleta (quais coletores executar)
   * @param consentConfig - Configuração de consentimento LGPD/GDPR (opcional)
   *
   * @requirements 12.1, 12.2
   */
  constructor(
    logger: AuditLogger,
    config?: Partial<ForensicCollectionConfig>,
    consentConfig?: ForensicConsentConfig
  ) {
    this.logger = logger;
    this.config = { ...DEFAULT_FORENSIC_CONFIG, ...config };
    this.consentConfig = consentConfig ?? DEFAULT_CONSENT_CONFIG;
  }

  /**
   * Coleta todos os metadados forenses configurados
   *
   * @param params - Parâmetros da captura
   * @returns Metadados forenses completos com informações de consentimento
   *
   * @requirements 12.3, 12.4, 12.5, 12.6, 12.7
   */
  async collect(params: ForensicCollectParams): Promise<ForensicMetadataWithConsent> {
    const stopTotalTimer = this.logger.startTimer('forensicCollection');
    const collectionErrors: Record<string, string> = {};
    const hasDOM = hasDOMAccess();

    // Criar logger com contexto da coleta para rastreabilidade
    this.collectionLogger = this.logger.withContext({
      captureId: params.captureId,
      url: params.url,
      hasDOMAccess: hasDOM,
    });

    this.collectionLogger.info('FORENSIC', 'COLLECTION_START', {});

    // Se não temos DOM, registrar quais coletores serão pulados
    if (!hasDOM) {
      this.collectionLogger.warn('FORENSIC', 'NO_DOM_ACCESS', {
        skippedCollectors: DOM_REQUIRED_COLLECTORS,
        reason: 'Executando em service worker sem acesso ao document',
      });
    }

    const domain = this.extractDomain(params.url);

    // Executa coletas em paralelo - Grupo 1: Coletores originais
    // Verifica consentimento para geolocalização do browser (requirement 12.3)
    const shouldCollectBrowserGeo = this.config.collectGeolocation && 
      this.consentConfig.collectBrowserGeolocation;
    
    const stopGroup1Timer = this.collectionLogger.startTimer('collectorsGroup1');
    this.collectionLogger.info('FORENSIC', 'COLLECTORS_GROUP_1_START', {
      collectorsCount: 12,
      browserGeoConsent: this.consentConfig.collectBrowserGeolocation,
    });

    // Serviço unificado de consulta de domínio (WhoisFreaks + WhoisXML fallback)
    const domainLookup = new DomainLookupService();

    // NOTA: SSLCollector e PageResourcesCollector têm guards internos para DOM
    const [
      geolocationResult,
      networkResult,
      deviceResult,
      dnsResult,
      sslResult,
      storageResult,
      resourcesResult,
      performanceResult,
      waybackResult,
      domainDnsResult,
      domainWhoisResult,
      domainSslResult,
    ] = await Promise.all([
      // GeolocationCollector só executa se consentimento foi dado (requirement 12.3)
      shouldCollectBrowserGeo
        ? new GeolocationCollector(this.logger).collect()
        : Promise.resolve(null),
      this.config.collectNetwork
        ? new NetworkCollector(this.logger).collect()
        : Promise.resolve(null),
      this.config.collectDevice
        ? new DeviceCollector(this.logger).collect()
        : Promise.resolve(null),
      this.config.collectDNS
        ? new DNSCollector(this.logger, domain).collect()
        : Promise.resolve(null),
      // SSLCollector tem guard interno - retorna resultado parcial sem DOM
      this.config.collectSSL
        ? new SSLCollector(this.logger, params.url).collect()
        : Promise.resolve(null),
      this.config.collectStorage
        ? new StorageCollector(this.logger).collect()
        : Promise.resolve(null),
      // PageResourcesCollector tem guard interno - retorna resultado vazio sem DOM
      this.config.collectResources
        ? new PageResourcesCollector(this.logger).collect()
        : Promise.resolve(null),
      this.config.collectPerformance
        ? new PerformanceCollector(this.logger).collect()
        : Promise.resolve(null),
      this.config.collectWayback
        ? new WaybackCollector(this.logger, params.url).collect()
        : Promise.resolve(null),
      // DomainLookupService unificado (WhoisFreaks -> WhoisXML fallback)
      this.config.collectDNS
        ? domainLookup.lookupDns(domain).catch(() => null)
        : Promise.resolve(null),
      this.config.collectWHOIS
        ? domainLookup.lookupWhois(domain).catch(() => null)
        : Promise.resolve(null),
      this.config.collectSSL
        ? domainLookup.lookupSsl(params.url).catch(() => null)
        : Promise.resolve(null),
    ]);

    const group1DurationMs = stopGroup1Timer();
    this.collectionLogger.info('FORENSIC', 'COLLECTORS_GROUP_1_COMPLETE', {
      durationMs: group1DurationMs,
    });

    // Executa coletas em paralelo - Grupo 2: Novos coletores
    // NOTA: CanvasFingerprint, WebGLFingerprint e Fonts têm guards internos para DOM
    // Verifica consentimento para fingerprints (requirements 12.4, 12.5, 12.6)
    const shouldCollectCanvas = this.config.collectCanvasFingerprint && 
      this.consentConfig.collectCanvasFingerprint;
    const shouldCollectWebGL = this.config.collectWebGLFingerprint && 
      this.consentConfig.collectWebGLFingerprint;
    const shouldCollectFonts = this.config.collectFonts && 
      this.consentConfig.collectFontsFingerprint;
    
    const stopGroup2Timer = this.collectionLogger.startTimer('collectorsGroup2');
    this.collectionLogger.info('FORENSIC', 'COLLECTORS_GROUP_2_START', {
      collectorsCount: 7,
      fingerprintConsent: {
        canvas: this.consentConfig.collectCanvasFingerprint,
        webgl: this.consentConfig.collectWebGLFingerprint,
        fonts: this.consentConfig.collectFontsFingerprint,
      },
    });
    const [
      canvasResult,
      webglResult,
      headersResult,
      mediaDevicesResult,
      fontsResult,
      serviceWorkersResult,
      permissionsResult,
    ] = await Promise.all([
      // CanvasFingerprintCollector só executa se consentimento foi dado (requirement 12.4)
      shouldCollectCanvas
        ? new CanvasFingerprintCollector(this.logger).collect()
        : Promise.resolve(null),
      // WebGLFingerprintCollector só executa se consentimento foi dado (requirement 12.5)
      shouldCollectWebGL
        ? new WebGLFingerprintCollector(this.logger).collect()
        : Promise.resolve(null),
      this.config.collectHeaders
        ? new HTTPHeadersCollector(this.logger, params.url).collect()
        : Promise.resolve(null),
      this.config.collectMediaDevices
        ? new MediaDevicesCollector(this.logger).collect()
        : Promise.resolve(null),
      // FontsCollector só executa se consentimento foi dado (requirement 12.6)
      shouldCollectFonts
        ? new FontsCollector(this.logger).collect()
        : Promise.resolve(null),
      this.config.collectServiceWorkers
        ? new ServiceWorkersCollector(this.logger).collect()
        : Promise.resolve(null),
      this.config.collectPermissions
        ? new PermissionsCollector(this.logger).collect()
        : Promise.resolve(null),
    ]);

    const group2DurationMs = stopGroup2Timer();
    this.collectionLogger.info('FORENSIC', 'COLLECTORS_GROUP_2_COMPLETE', {
      durationMs: group2DurationMs,
    });

    // Processa resultados e coleta erros
    const processResult = <T>(
      name: string,
      result: { success: boolean; data?: T; error?: string } | null
    ): T | undefined => {
      if (!result) {
        return undefined;
      }
      if (!result.success && result.error) {
        collectionErrors[name] = result.error;
      }
      return result.data;
    };

    // Processa grupo 1
    const geolocation = processResult('geolocation', geolocationResult);
    const network = processResult('network', networkResult);
    const device = processResult('device', deviceResult);
    const storage = processResult('storage', storageResult);
    const pageResources = processResult('pageResources', resourcesResult);
    const performance = processResult('performance', performanceResult);
    const waybackMachine = processResult('wayback', waybackResult);

    // DNS: Prefere DomainLookupService (WhoisFreaks -> WhoisXML), fallback para Google/Cloudflare
    const fallbackDns = processResult('dns', dnsResult);
    const dns = domainDnsResult?.provider !== 'none'
      ? domainDnsResult?.data
      : fallbackDns;
    if (domainDnsResult?.provider === 'none' && !fallbackDns) {
      collectionErrors['domain-dns'] = 'Nenhum provedor retornou dados DNS';
    }

    // SSL: Prefere DomainLookupService (dados completos), fallback para SSLCollector básico
    const fallbackSsl = processResult('ssl', sslResult);
    const sslCertificate = domainSslResult?.provider !== 'none'
      ? domainSslResult?.data
      : (fallbackSsl ?? { isSecure: params.url.startsWith('https://') });
    if (domainSslResult?.provider === 'none') {
      collectionErrors['domain-ssl'] = 'Nenhum provedor retornou dados SSL completos';
    }

    // WHOIS: Usa DomainLookupService (WhoisFreaks -> WhoisXML)
    const whois = domainWhoisResult?.provider !== 'none'
      ? domainWhoisResult?.data
      : undefined;
    if (domainWhoisResult?.provider === 'none') {
      collectionErrors['domain-whois'] = 'Nenhum provedor retornou dados WHOIS';
    }

    // Processa grupo 2
    const canvasFingerprint = processResult('canvasFingerprint', canvasResult);
    const webglFingerprint = processResult('webglFingerprint', webglResult);
    const httpHeaders = processResult('httpHeaders', headersResult);
    const mediaDevices = processResult('mediaDevices', mediaDevicesResult);
    const fonts = processResult('fonts', fontsResult);
    const serviceWorkers = processResult('serviceWorkers', serviceWorkersResult);
    const permissions = processResult('permissions', permissionsResult);

    // Timezone collector (precisa do IP timezone do network)
    let timezone;
    if (this.config.collectTimezone) {
      const ipTimezone = network?.timezone;
      const timezoneResult = await new TimezoneCollector(this.logger, ipTimezone).collect();
      timezone = processResult('timezone', timezoneResult);
    }

    // Cookies são placeholders (requerem chrome.cookies API no service worker)
    const cookies = this.config.collectCookies ? this.collectCookiesPlaceholder() : undefined;

    // Duração será calculada pelo timer stopTotalTimer
    const totalDurationMs = stopTotalTimer();
    const collectionDurationMs = totalDurationMs;

    // Monta hashes
    const hashes: ForensicMetadataLegacy['hashes'] = {};
    if (typeof params.imageHash === 'string') {
      hashes.imageHash = params.imageHash;
    }
    if (typeof params.htmlHash === 'string') {
      hashes.htmlHash = params.htmlHash;
    }

    // Cria informações de consentimento (requirement 12.7)
    const consentInfo: ForensicConsentInfo = createForensicConsentInfo(this.consentConfig);

    // Agrupa fingerprints sob objeto único (v3.0.0 structure)
    const fingerprints: ForensicFingerprints | undefined = 
      (canvasFingerprint || webglFingerprint || fonts)
        ? {
            ...(canvasFingerprint && { canvas: canvasFingerprint }),
            ...(webglFingerprint && { webgl: webglFingerprint }),
            ...(fonts && { fonts }),
          }
        : undefined;

    // Monta metadata no formato legado (v2.0.0) para compatibilidade
    // TODO: Migrar para ForensicMetadataV3 quando backend estiver pronto
    const metadata: ForensicMetadataLegacy = {
      schemaVersion: '2.0.0',
      captureId: params.captureId,
      collectionTimestamp: new Date().toISOString(),
      collectionDurationMs,
      url: params.url,
      title: params.title,
      userAgent: navigator.userAgent,
      extensionVersion: this.getExtensionVersion(),
      viewport: params.viewport,
      pageSize: params.pageSize,
      viewportsCaptured: params.viewportsCaptured,
      hashes,
    };

    // Adiciona dados coletados (apenas se existirem)
    if (geolocation) { metadata.geolocation = geolocation; }
    if (network) { metadata.network = network; }
    if (sslCertificate) { metadata.sslCertificate = sslCertificate; }
    if (httpHeaders) { metadata.httpHeaders = httpHeaders; }
    if (dns) { metadata.dns = dns; }
    if (whois) { metadata.whois = whois; }
    if (device) { metadata.device = device; }
    if (cookies && cookies.length > 0) { metadata.cookies = cookies; }
    if (storage) { metadata.storage = storage; }
    if (pageResources) { metadata.pageResources = pageResources; }
    if (waybackMachine) { metadata.waybackMachine = waybackMachine; }
    if (performance) { metadata.performance = performance; }
    if (timezone) { metadata.timezone = timezone; }
    if (canvasFingerprint) { metadata.canvasFingerprint = canvasFingerprint; }
    if (webglFingerprint) { metadata.webglFingerprint = webglFingerprint; }
    if (mediaDevices) { metadata.mediaDevices = mediaDevices; }
    if (fonts) { metadata.fonts = fonts; }
    if (serviceWorkers) { metadata.serviceWorkers = serviceWorkers; }
    if (permissions) { metadata.permissions = permissions; }
    if (Object.keys(collectionErrors).length > 0) {
      metadata.collectionErrors = collectionErrors;
    }

    // Adiciona informações de consentimento ao metadata (requirement 12.7)
    // Usando extensão do tipo para incluir consent no formato legado
    const metadataWithConsent = {
      ...metadata,
      consent: consentInfo,
      // Inclui fingerprints agrupados para futura migração v3.0.0
      ...(fingerprints && { fingerprintsGrouped: fingerprints }),
    } as ForensicMetadataLegacy & { 
      consent: ForensicConsentInfo; 
      fingerprintsGrouped?: ForensicFingerprints;
    };

    this.collectionLogger.info('FORENSIC', 'COLLECTION_COMPLETE', {
      durationMs: collectionDurationMs,
      errorsCount: Object.keys(collectionErrors).length,
      collectorsExecuted: 21 - Object.keys(collectionErrors).length,
      skippedNoDom: hasDOM ? 0 : DOM_REQUIRED_COLLECTORS.length,
      consentConfig: this.consentConfig,
    });

    // Limpar logger de contexto
    this.collectionLogger = null;

    return metadataWithConsent;
  }

  /**
   * Placeholder para cookies (requer chrome.cookies API no service worker)
   * @returns Array vazio - cookies reais são coletados via chrome.cookies
   */
  private collectCookiesPlaceholder(): CookieInfo[] {
    return [];
  }

  /**
   * Extrai domínio de uma URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  /**
   * Obtém versão da extensão
   */
  private getExtensionVersion(): string {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest !== undefined) {
      return chrome.runtime.getManifest().version;
    }
    return '0.0.0';
  }
}

export default ForensicCollector;
