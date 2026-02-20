/**
 * Re-exporta ForensicCollector do módulo forensic
 *
 * IMPORTANTE: Importar diretamente do forensic-collector.ts, NÃO do index.ts
 * O index.ts pode puxar coletores que usam DOM e causar erro no service worker.
 *
 * @module ForensicCollector
 * @deprecated Use import { ForensicCollector } from './forensic/forensic-collector' diretamente
 */

export { ForensicCollector, type ForensicCollectParams } from './forensic/forensic-collector';
export { ForensicCollector as default } from './forensic/forensic-collector';
