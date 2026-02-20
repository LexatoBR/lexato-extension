/**
 * Exporta coletores forenses DOM-safe
 *
 * IMPORTANTE: Este arquivo exporta APENAS coletores que NÃO usam DOM!
 * Coletores que usam document.* ou window.* específicos NÃO devem ser
 * exportados aqui para evitar erro "document is not defined" quando
 * este módulo é importado em service worker.
 *
 * Coletores DOM-required devem ser importados diretamente do seu arquivo
 * específico usando dynamic import com guard hasDOMAccess().
 *
 * @module ForensicCollectors
 */

// ============================================================================
// COLETORES DOM-SAFE (seguros para service worker)
// ============================================================================

export { BaseCollector, type CollectorResult } from './base-collector';
export { GeolocationCollector } from './geolocation-collector';
export { NetworkCollector } from './network-collector';
export { DeviceCollector } from './device-collector';
export { DNSCollector } from './dns-collector';
export { StorageCollector } from './storage-collector';
export { PerformanceCollector } from './performance-collector';
export { WaybackCollector } from './wayback-collector';
export { HTTPHeadersCollector } from './http-headers-collector';
export { TimezoneCollector } from './timezone-collector';
export { MediaDevicesCollector } from './media-devices-collector';
export { ServiceWorkersCollector } from './service-workers-collector';
export { PermissionsCollector } from './permissions-collector';

// Coletores WhoisFreaks LEGADOS - NÃO exportados
// A extensão agora usa DomainLookupService (backend proxy) para DNS/WHOIS/SSL.
// Os arquivos whoisfreaks-*-collector.ts permanecem apenas como referência.

// ============================================================================
// COLETORES DOM-REQUIRED (NÃO exportados - usar dynamic import)
// ============================================================================
// Os seguintes coletores NÃO são exportados aqui pois usam APIs DOM:
//
// - SSLCollector (document.querySelectorAll)
//   → import('./ssl-collector').then(m => new m.SSLCollector(...))
//
// - PageResourcesCollector (document.querySelectorAll)
//   → import('./page-resources-collector').then(m => new m.PageResourcesCollector(...))
//
// - CanvasFingerprintCollector (document.createElement)
//   → import('./canvas-fingerprint-collector').then(m => new m.CanvasFingerprintCollector(...))
//
// - WebGLFingerprintCollector (document.createElement)
//   → import('./webgl-fingerprint-collector').then(m => new m.WebGLFingerprintCollector(...))
//
// - FontsCollector (document.fonts)
//   → import('./fonts-collector').then(m => new m.FontsCollector(...))
//
// Para usar esses coletores, importe diretamente do arquivo específico
// com guard hasDOMAccess() do context-utils.ts
