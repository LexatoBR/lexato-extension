/**
 * Módulo de coleta forense
 *
 * IMPORTANTE: NÃO usar `export * from './collectors'` aqui!
 * Isso força o bundler a incluir TODOS os coletores no bundle,
 * incluindo os que usam DOM (document.createElement, document.querySelectorAll).
 * Quando este módulo é importado no service worker, causa erro:
 * "document is not defined"
 *
 * Os coletores que usam DOM são carregados via dynamic import no ForensicCollector
 * apenas quando hasDOMAccess() retorna true (content scripts).
 *
 * @module Forensic
 */

export { ForensicCollector, type ForensicCollectParams } from './forensic-collector';

// Exportar apenas coletores que NÃO usam DOM (seguros para service worker)
export { BaseCollector, type CollectorResult } from './collectors/base-collector';
export { GeolocationCollector } from './collectors/geolocation-collector';
export { NetworkCollector } from './collectors/network-collector';
export { DeviceCollector } from './collectors/device-collector';
export { DNSCollector } from './collectors/dns-collector';
export { StorageCollector } from './collectors/storage-collector';
export { PerformanceCollector } from './collectors/performance-collector';
export { WaybackCollector } from './collectors/wayback-collector';
export { HTTPHeadersCollector } from './collectors/http-headers-collector';
export { TimezoneCollector } from './collectors/timezone-collector';

export { MediaDevicesCollector } from './collectors/media-devices-collector';
export { ServiceWorkersCollector } from './collectors/service-workers-collector';
export { PermissionsCollector } from './collectors/permissions-collector';
// Coletores WhoisFreaks LEGADOS - NÃO exportados
// A extensão agora usa DomainLookupService (backend proxy) para DNS/WHOIS/SSL.
// Os arquivos whoisfreaks-*-collector.ts permanecem apenas como referência.

// Exportar utilitário de carregamento seguro para collectors DOM-required
export {
  loadDOMCollector,
  loadDOMCollectorWithOptions,
  canLoadDOMCollector,
  isDOMRequiredCollector,
  DOM_REQUIRED_COLLECTORS,
  type LoadDOMCollectorOptions,
  type SafeLoaderResult,
} from './safe-loader';

// NOTA: Os seguintes coletores NÃO são exportados aqui pois usam DOM:
// - SSLCollector (document.querySelectorAll)
// - PageResourcesCollector (document.querySelectorAll)
// - CanvasFingerprintCollector (document.createElement)
// - WebGLFingerprintCollector (document.createElement)
// - FontsCollector (document.fonts)
// Eles são carregados via dynamic import no ForensicCollector quando necessário.
// Use loadDOMCollector() do safe-loader.ts para carregá-los de forma segura.
