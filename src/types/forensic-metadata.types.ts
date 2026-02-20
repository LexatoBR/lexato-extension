/**
 * Tipos para metadados forenses de provas digitais
 *
 * Define interfaces para coleta abrangente de dados que fortalecem
 * a validade jurídica das evidências capturadas.
 *
 * @module ForensicMetadataTypes
 */

// ============================================================================
// Timezone Evidence
// ============================================================================

/**
 * Fonte de evidência de timezone
 */
export interface TimezoneSource {
  /** Nome da fonte */
  source: string;
  /** Valor obtido */
  value: string;
}

/**
 * Evidências de timezone para validação cruzada
 * Inconsistências podem indicar uso de VPN ou manipulação
 */
export interface TimezoneEvidence {
  /** Fontes consultadas */
  sources: TimezoneSource[];
  /** Se todas as fontes são consistentes */
  consistent: boolean;
  /** Timezone via Intl.DateTimeFormat */
  intlTimezone?: string;
  /** Offset em minutos via Date.getTimezoneOffset */
  offsetMinutes?: number;
  /** Offset formatado (ex: UTC-03:00) */
  offsetString?: string;
  /** Timezone obtido via IP geolocation */
  ipTimezone?: string;
  /** performance.now() para detectar manipulação */
  performanceNow?: number;
  /** Date.now() para comparação */
  dateNow?: number;
  /** Locale do navegador */
  locale?: string;
  /** Detalhes de inconsistência detectada */
  inconsistencyDetails?: string;
  /** Se há sinais de manipulação */
  possibleManipulation?: boolean;
}

// ============================================================================
// Geolocalização
// ============================================================================

/**
 * Dados de geolocalização do dispositivo (legado - mantido para compatibilidade)
 * Requer permissão 'geolocation' no manifest
 */
export interface GeoLocationData {
  /** Latitude em graus decimais */
  latitude: number;
  /** Longitude em graus decimais */
  longitude: number;
  /** Precisão da localização em metros */
  accuracy: number;
  /** Altitude em metros (se disponível) */
  altitude?: number;
  /** Precisão da altitude em metros */
  altitudeAccuracy?: number;
  /** Direção do movimento em graus (0-360) */
  heading?: number;
  /** Velocidade em metros/segundo */
  speed?: number;
  /** Timestamp da leitura */
  timestamp: number;
  /** Fonte da localização */
  source: 'gps' | 'network' | 'ip' | 'unavailable';
  /** Erro se não foi possível obter */
  error?: string;
}

// ============================================================================
// Geolocalização em 3 Níveis (v3.0.0)
// ============================================================================

/**
 * Nível 1: Geolocalização via CloudFront Headers
 * Sempre disponível, sem necessidade de consentimento (dados de infraestrutura)
 * Precisão: cidade/região (~km)
 */
export interface CloudFrontGeolocation {
  /** Código do país ISO 3166-1 alpha-2 (ex: "BR") */
  country: string;
  /** Nome do país (ex: "Brazil") */
  countryName?: string;
  /** Código da região ISO 3166-2 (ex: "SP") */
  region?: string;
  /** Nome da região (ex: "São Paulo") */
  regionName?: string;
  /** Nome da cidade */
  city?: string;
  /** Latitude aproximada (do CloudFront) */
  latitude?: number;
  /** Longitude aproximada (do CloudFront) */
  longitude?: number;
  /** CEP aproximado */
  postalCode?: string;
  /** Timezone IANA (ex: "America/Sao_Paulo") */
  timezone?: string;
  /** IP:porta do viewer */
  viewerAddress?: string;
  /** Autonomous System Number */
  asn?: string;
  /** Nível de precisão da localização */
  accuracy: 'country' | 'region' | 'city';
}

/**
 * Nível 2: Geolocalização via Browser Geolocation API
 * Opcional, requer consentimento explícito do usuário
 * Precisão: metros (GPS) ou ~100m (rede Wi-Fi)
 */
export interface BrowserGeolocation {
  /** Latitude precisa (GPS/rede) */
  latitude: number;
  /** Longitude precisa (GPS/rede) */
  longitude: number;
  /** Precisão em metros */
  accuracy: number;
  /** Altitude em metros (se disponível) */
  altitude?: number;
  /** Precisão da altitude em metros */
  altitudeAccuracy?: number;
  /** Direção do movimento em graus (0-360) */
  heading?: number;
  /** Velocidade em metros/segundo */
  speed?: number;
  /** Timestamp da leitura */
  timestamp: number;
  /** Fonte da localização */
  source: 'gps' | 'network';
}

/**
 * Nível 3: Geolocalização enriquecida via Amazon Location Service
 * Opcional, converte coordenadas em endereço completo (reverse geocoding)
 * Custo: ~$0.40/1000 requests
 */
export interface EnrichedGeolocation {
  /** Endereço completo formatado */
  address: string;
  /** Nome da rua */
  street?: string;
  /** Número */
  number?: string;
  /** Bairro */
  neighborhood?: string;
  /** Cidade */
  city?: string;
  /** Estado */
  state?: string;
  /** CEP */
  postalCode?: string;
  /** País */
  country?: string;
  /** Timezone */
  timezone?: string;
  /** Bucket de pricing AWS (para tracking de custos) */
  pricingBucket?: string;
}

/**
 * Estrutura de geolocalização em 3 níveis para ForensicMetadata v3.0.0
 *
 * Arquitetura:
 * - Nível 1 (CloudFront): Sempre disponível, sem consentimento
 * - Nível 2 (Browser): Opcional, com consentimento
 * - Nível 3 (Enriched): Opcional, reverse geocoding
 *
 * @requirements 11.3, 11.4
 */
export interface ForensicGeolocation {
  /** Nível 1: Geolocalização via CloudFront Headers (sempre disponível) */
  cloudfront?: CloudFrontGeolocation;

  /** Nível 2: Geolocalização via Browser API (opcional, com consentimento) */
  browser?: BrowserGeolocation;

  /** Nível 3: Endereço enriquecido via Amazon Location Service (opcional) */
  enriched?: EnrichedGeolocation;

  /** Fontes de geolocalização utilizadas */
  sources: ('cloudfront' | 'browser' | 'location-service')[];

  /** Se o usuário concedeu consentimento para geolocalização do browser */
  consentGranted: boolean;

  /** Timestamp da coleta de geolocalização (ISO 8601) */
  collectionTimestamp: string;
}

// ============================================================================
// Sistema de Consentimento LGPD/GDPR (v3.0.0)
// ============================================================================

/**
 * Configuração de consentimento para coleta de dados forenses
 *
 * Define quais dados são coletados com base no consentimento do usuário.
 * Campos sempre coletados têm tipo literal `true`.
 * Campos opcionais têm tipo `boolean` e requerem consentimento explícito.
 *
 * @requirements 4.1, 4.2, 4.3
 */
export interface ForensicConsentConfig {
  // ========================================
  // Dados sempre coletados (não requerem consentimento)
  // ========================================

  /** Metadados básicos: timestamp, URL, título, user-agent */
  collectBasicMetadata: true;

  /** Geolocalização via CloudFront (IP-based, dados de infraestrutura) */
  collectCloudFrontGeo: true;

  /** Informações de rede: tipo de conexão, velocidade */
  collectNetworkInfo: true;

  /** Informações básicas do dispositivo: plataforma, idioma, viewport */
  collectDeviceBasic: true;

  // ========================================
  // Dados opcionais (requerem consentimento explícito)
  // ========================================

  /** Geolocalização precisa via Browser API (GPS/rede) */
  collectBrowserGeolocation: boolean;

  /** Fingerprint de Canvas */
  collectCanvasFingerprint: boolean;

  /** Fingerprint WebGL */
  collectWebGLFingerprint: boolean;

  /** Fingerprint de Fontes instaladas */
  collectFontsFingerprint: boolean;
}

/**
 * Configuração padrão de consentimento
 *
 * Todos os campos opcionais iniciam como `false` (não coletados)
 * até que o usuário conceda consentimento explícito.
 *
 * @requirements 4.3
 */
export const DEFAULT_CONSENT_CONFIG: ForensicConsentConfig = {
  // Sempre coletados
  collectBasicMetadata: true,
  collectCloudFrontGeo: true,
  collectNetworkInfo: true,
  collectDeviceBasic: true,

  // Opcionais - iniciam desabilitados
  collectBrowserGeolocation: false,
  collectCanvasFingerprint: false,
  collectWebGLFingerprint: false,
  collectFontsFingerprint: false,
};

/**
 * Informações de consentimento incluídas nos metadados forenses
 */
export interface ForensicConsentInfo {
  /** Configuração de consentimento utilizada */
  config: ForensicConsentConfig;

  /** Timestamp do consentimento (ISO 8601) */
  timestamp: string;

  /** Versão do schema de consentimento */
  version: string;
}

// ============================================================================
// Informações de Rede
// ============================================================================

/**
 * Informações de rede e conectividade
 */
export interface NetworkInfo {
  /** IP público do usuário */
  publicIp?: string;
  /** Tipo de conexão */
  connectionType?: 'wifi' | 'cellular' | 'ethernet' | 'bluetooth' | 'unknown';
  /** Tipo efetivo de conexão (velocidade estimada) */
  effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
  /** Velocidade de download estimada em Mbps */
  downlink?: number;
  /** Round-trip time em milissegundos */
  rtt?: number;
  /** Se está em modo de economia de dados */
  saveData?: boolean;
  /** Provedor de internet (via IP lookup) */
  isp?: string;
  /** Organização (via IP lookup) */
  organization?: string;
  /** ASN - Autonomous System Number */
  asn?: string;
  /** Cidade (via IP lookup) */
  city?: string;
  /** Região/Estado (via IP lookup) */
  region?: string;
  /** País (via IP lookup) */
  country?: string;
  /** Código do país ISO */
  countryCode?: string;
  /** Timezone do IP */
  timezone?: string;
}

// ============================================================================
// Certificado SSL/TLS
// ============================================================================

/**
 * Informações do certificado SSL/TLS do site capturado
 */
export interface SSLCertificateInfo {
  /** Se a conexão é segura (HTTPS) */
  isSecure: boolean;
  /** Protocolo de segurança (TLS 1.2, TLS 1.3, etc.) */
  protocol?: string;
  /** Emissor do certificado (CA) */
  issuer?: string;
  /** Organização do emissor */
  issuerOrganization?: string;
  /** Sujeito do certificado (domínio) */
  subject?: string;
  /** Data de início de validade */
  validFrom?: string;
  /** Data de expiração */
  validTo?: string;
  /** Fingerprint SHA-256 do certificado */
  fingerprint?: string;
  /** Algoritmo de assinatura */
  signatureAlgorithm?: string;
  /** Tamanho da chave em bits */
  keySize?: number;
  /** Nomes alternativos (SANs) */
  subjectAltNames?: string[];
  /** Se o certificado é válido */
  isValid?: boolean;
  /** Dias até expiração */
  daysUntilExpiration?: number;
}

// ============================================================================
// Headers HTTP
// ============================================================================

/**
 * Headers HTTP da resposta da página
 */
export interface HTTPHeadersInfo {
  /** Servidor web */
  server?: string;
  /** Tipo de conteúdo */
  contentType?: string;
  /** Encoding do conteúdo */
  contentEncoding?: string;
  /** Última modificação */
  lastModified?: string;
  /** ETag para cache */
  etag?: string;
  /** Controle de cache */
  cacheControl?: string;
  /** Política de segurança de conteúdo */
  contentSecurityPolicy?: string;
  /** Proteção contra clickjacking */
  xFrameOptions?: string;
  /** Proteção XSS */
  xXssProtection?: string;
  /** Tipo de conteúdo estrito */
  xContentTypeOptions?: string;
  /** Política de referrer */
  referrerPolicy?: string;
  /** HSTS - HTTP Strict Transport Security */
  strictTransportSecurity?: string;
  /** Todos os headers (raw) */
  allHeaders?: Record<string, string>;
}

// ============================================================================
// DNS e WHOIS
// ============================================================================

/**
 * Informações de DNS do domínio
 */
export interface DNSInfo {
  /** Domínio consultado */
  domain: string;
  /** Registros A (IPv4) */
  aRecords?: string[];
  /** Registros AAAA (IPv6) */
  aaaaRecords?: string[];
  /** Registros MX (email) */
  mxRecords?: string[];
  /** Registros NS (nameservers) */
  nsRecords?: string[];
  /** Registros TXT */
  txtRecords?: string[];
  /** Registros CNAME */
  cnameRecords?: string[];
  /** TTL em segundos */
  ttl?: number;
  /** Timestamp da consulta */
  queryTimestamp: string;
}

/**
 * Informações WHOIS do domínio
 */
export interface WHOISInfo {
  /** Domínio consultado */
  domain: string;
  /** Registrar (empresa de registro) */
  registrar?: string;
  /** URL do registrar */
  registrarUrl?: string;
  /** Data de criação do domínio */
  creationDate?: string;
  /** Data de atualização */
  updatedDate?: string;
  /** Data de expiração */
  expirationDate?: string;
  /** Status do domínio */
  status?: string[];
  /** Organização do registrante */
  registrantOrganization?: string;
  /** País do registrante */
  registrantCountry?: string;
  /** Nameservers */
  nameServers?: string[];
  /** DNSSEC habilitado */
  dnssec?: boolean;
}

// ============================================================================
// Informações do Dispositivo
// ============================================================================

/**
 * Informações detalhadas do dispositivo
 */
export interface DeviceInfo {
  /** Plataforma (Win32, MacIntel, Linux, etc.) */
  platform: string;
  /** Número de núcleos de CPU */
  hardwareConcurrency: number;
  /** Memória RAM em GB (aproximado) */
  deviceMemory?: number;
  /** Resolução da tela */
  screenResolution: string;
  /** Profundidade de cor em bits */
  colorDepth: number;
  /** Pixel ratio (para telas retina) */
  devicePixelRatio: number;
  /** Timezone (ex: America/Sao_Paulo) */
  timezone: string;
  /** Offset do timezone em minutos */
  timezoneOffset: number;
  /** Idioma principal */
  language: string;
  /** Lista de idiomas preferidos */
  languages: string[];
  /** Se é dispositivo touch */
  touchSupport: boolean;
  /** Número máximo de pontos de toque */
  maxTouchPoints: number;
  /** Orientação da tela */
  screenOrientation?: string;
  /** Se está online */
  onLine: boolean;
  /** Vendor do navegador */
  vendor: string;
  /** Versão do navegador */
  browserVersion: string;
  /** Nome do navegador */
  browserName: string;
  /** Se cookies estão habilitados */
  cookieEnabled: boolean;
  /** Se Do Not Track está habilitado */
  doNotTrack?: string;
  /** Se PDF viewer está disponível */
  pdfViewerEnabled?: boolean;
  /** Plugins instalados (nomes) */
  plugins?: string[];
}

// ============================================================================
// Cookies e Storage
// ============================================================================

/**
 * Informações de cookies do domínio capturado
 */
export interface CookieInfo {
  /** Nome do cookie */
  name: string;
  /** Domínio do cookie */
  domain: string;
  /** Caminho do cookie */
  path: string;
  /** Se é seguro (HTTPS only) */
  secure: boolean;
  /** Se é HttpOnly (não acessível via JS) */
  httpOnly: boolean;
  /** Política SameSite */
  sameSite: 'strict' | 'lax' | 'none' | 'unspecified';
  /** Data de expiração */
  expirationDate?: number;
  /** Se é cookie de sessão */
  session: boolean;
  /** Tamanho do valor em bytes */
  valueSize: number;
}

/**
 * Informações de storage do domínio
 */
export interface StorageInfo {
  /** Chaves no localStorage */
  localStorageKeys: string[];
  /** Tamanho total do localStorage em bytes */
  localStorageSize: number;
  /** Chaves no sessionStorage */
  sessionStorageKeys: string[];
  /** Tamanho total do sessionStorage em bytes */
  sessionStorageSize: number;
  /** Se IndexedDB está disponível */
  indexedDBAvailable: boolean;
  /** Nomes dos bancos IndexedDB */
  indexedDBDatabases?: string[];
}

// ============================================================================
// Recursos da Página
// ============================================================================

/**
 * Recurso carregado pela página
 */
export interface PageResource {
  /** URL do recurso */
  url: string;
  /** Tipo do recurso */
  type: 'script' | 'stylesheet' | 'image' | 'font' | 'media' | 'other';
  /** Tamanho em bytes (se disponível) */
  size?: number;
  /** Hash SHA-256 do conteúdo (se calculado) */
  hash?: string;
  /** Se foi carregado com sucesso */
  loaded: boolean;
  /** Tempo de carregamento em ms */
  loadTimeMs?: number;
  /** Se é recurso de terceiros */
  isThirdParty: boolean;
}

/**
 * Resumo dos recursos da página
 */
export interface PageResourcesSummary {
  /** Total de scripts */
  scriptsCount: number;
  /** Total de stylesheets */
  stylesheetsCount: number;
  /** Total de imagens */
  imagesCount: number;
  /** Total de fontes */
  fontsCount: number;
  /** Total de recursos de mídia */
  mediaCount: number;
  /** Tamanho total estimado em bytes */
  totalSizeBytes: number;
  /** Recursos de terceiros */
  thirdPartyCount: number;
  /** Lista detalhada (opcional, pode ser grande) */
  resources?: PageResource[];
}

// ============================================================================
// Archive.org / Wayback Machine
// ============================================================================

/**
 * Informações do Wayback Machine
 */
export interface WaybackMachineInfo {
  /** URL consultada */
  url: string;
  /** Se existe arquivo da URL */
  archived: boolean;
  /** URL do snapshot mais recente */
  latestSnapshotUrl?: string;
  /** Data do snapshot mais recente */
  latestSnapshotDate?: string;
  /** Total de snapshots disponíveis */
  totalSnapshots?: number;
  /** Data do primeiro snapshot */
  firstSnapshotDate?: string;
  /** Timestamp da consulta */
  queryTimestamp: string;
}

// ============================================================================
// Timestamp Authority (Carimbo de Tempo)
// ============================================================================

/**
 * Informações de carimbo de tempo (TSA)
 * RFC 3161 - Time-Stamp Protocol
 */
export interface TimestampAuthorityInfo {
  /** URL da autoridade de carimbo de tempo */
  tsaUrl: string;
  /** Nome da TSA */
  tsaName: string;
  /** Token de timestamp (Base64) */
  timestampToken?: string;
  /** Data/hora certificada (ISO 8601) */
  certifiedTimestamp?: string;
  /** Hash do conteúdo carimbado */
  contentHash?: string;
  /** Algoritmo de hash usado */
  hashAlgorithm: string;
  /** Se o carimbo foi obtido com sucesso */
  success: boolean;
  /** Erro se falhou */
  error?: string;
  /** Se é TSA ICP-Brasil (validade legal no Brasil) */
  isICPBrasil: boolean;
}

// ============================================================================
// Performance e Timing
// ============================================================================

/**
 * Métricas de performance da página
 */
export interface PerformanceMetrics {
  /** Tempo de navegação total em ms */
  navigationTime?: number;
  /** Tempo até DOM Content Loaded em ms */
  domContentLoaded?: number;
  /** Tempo até Load event em ms */
  loadEventTime?: number;
  /** Tempo até First Paint em ms */
  firstPaint?: number;
  /** Tempo até First Contentful Paint em ms */
  firstContentfulPaint?: number;
  /** Tempo até Largest Contentful Paint em ms */
  largestContentfulPaint?: number;
  /** Cumulative Layout Shift */
  cumulativeLayoutShift?: number;
  /** First Input Delay em ms */
  firstInputDelay?: number;
  /** Time to Interactive em ms */
  timeToInteractive?: number;
  /** Tamanho total transferido em bytes */
  transferSize?: number;
  /** Tamanho decodificado em bytes */
  decodedBodySize?: number;
}

// ============================================================================
// Canvas Fingerprint
// ============================================================================

/**
 * Fingerprint de canvas do dispositivo
 */
export interface CanvasFingerprint {
  /** Se canvas está disponível */
  available: boolean;
  /** Hash SHA-256 do canvas renderizado */
  hash?: string;
  /** Largura do canvas usado */
  width?: number;
  /** Altura do canvas usado */
  height?: number;
  /** Se canvas fingerprinting está bloqueado */
  blocked?: boolean;
  /** Erro se falhou */
  error?: string;
}

// ============================================================================
// WebGL Fingerprint
// ============================================================================

/**
 * Fingerprint WebGL do dispositivo
 */
export interface WebGLFingerprint {
  /** Se WebGL está disponível */
  available: boolean;
  /** Hash do fingerprint */
  hash?: string;
  /** Versão do WebGL */
  version?: string;
  /** Versão da linguagem de shading */
  shadingLanguageVersion?: string;
  /** Vendor (pode ser mascarado) */
  vendor?: string;
  /** Renderer (pode ser mascarado) */
  renderer?: string;
  /** Vendor real (via WEBGL_debug_renderer_info) */
  unmaskedVendor?: string;
  /** Renderer real (via WEBGL_debug_renderer_info) */
  unmaskedRenderer?: string;
  /** Tamanho máximo de textura */
  maxTextureSize?: number;
  /** Dimensões máximas do viewport */
  maxViewportDims?: number[];
  /** Tamanho máximo de renderbuffer */
  maxRenderbufferSize?: number;
  /** Máximo de vertex attribs */
  maxVertexAttribs?: number;
  /** Máximo de vertex uniform vectors */
  maxVertexUniformVectors?: number;
  /** Máximo de fragment uniform vectors */
  maxFragmentUniformVectors?: number;
  /** Máximo de varying vectors */
  maxVaryingVectors?: number;
  /** Extensões suportadas */
  extensions?: string[];
  /** Quantidade de extensões */
  extensionsCount?: number;
  /** Se antialiasing está habilitado */
  antialias?: boolean;
  /** Erro se falhou */
  error?: string;
}

// ============================================================================
// Media Devices
// ============================================================================

/**
 * Item de dispositivo de mídia
 */
export interface MediaDeviceItem {
  /** Tipo do dispositivo */
  kind: MediaDeviceKind;
  /** Label do dispositivo (requer permissão) */
  label?: string;
  /** ID do dispositivo (hash) */
  deviceId?: string;
  /** ID do grupo */
  groupId?: string;
}

/**
 * Informações de dispositivos de mídia
 */
export interface MediaDevicesInfo {
  /** Se API está disponível */
  available: boolean;
  /** Lista de dispositivos */
  devices: MediaDeviceItem[];
  /** Total de dispositivos */
  totalDevices?: number;
  /** Quantidade de inputs de áudio */
  audioInputCount: number;
  /** Quantidade de outputs de áudio */
  audioOutputCount: number;
  /** Quantidade de inputs de vídeo */
  videoInputCount: number;
  /** Erro se falhou */
  error?: string;
}

// ============================================================================
// Fonts Info
// ============================================================================

/**
 * Informações de fontes instaladas
 */
export interface FontsInfo {
  /** Se detecção está disponível */
  available: boolean;
  /** Lista de fontes detectadas */
  installedFonts: string[];
  /** Total de fontes testadas */
  totalTested: number;
  /** Total de fontes instaladas */
  installedCount?: number;
  /** Método de detecção usado */
  method?: 'FontFaceSet' | 'Canvas';
  /** Hash da lista de fontes */
  hash?: string;
  /** Erro se falhou */
  error?: string;
}

// ============================================================================
// Service Workers Info
// ============================================================================

/**
 * Item de Service Worker
 */
export interface ServiceWorkerItem {
  /** Escopo do worker */
  scope: string;
  /** URL do script */
  scriptURL?: string;
  /** Estado do worker */
  state?: ServiceWorkerState;
  /** Política de atualização via cache */
  updateViaCache: ServiceWorkerUpdateViaCache;
}

/**
 * Informações de Service Workers
 */
export interface ServiceWorkersInfo {
  /** Se API está disponível */
  available: boolean;
  /** Lista de workers registrados */
  workers: ServiceWorkerItem[];
  /** Total de workers */
  totalWorkers?: number;
  /** Se há controller ativo */
  hasController?: boolean;
  /** URL do script do controller */
  controllerScriptURL?: string;
  /** Estado do controller */
  controllerState?: ServiceWorkerState;
  /** Erro se falhou */
  error?: string;
}

// ============================================================================
// Permissions Info
// ============================================================================

/**
 * Item de permissão
 */
export interface PermissionItem {
  /** Nome da permissão */
  name: string;
  /** Estado da permissão */
  state: PermissionState | 'unsupported';
}

/**
 * Informações de permissões do navegador
 */
export interface PermissionsInfo {
  /** Se API está disponível */
  available: boolean;
  /** Lista de permissões verificadas */
  permissions: PermissionItem[];
  /** Quantidade de permissões concedidas */
  grantedCount?: number;
  /** Quantidade de permissões negadas */
  deniedCount?: number;
  /** Quantidade de permissões pendentes */
  promptCount?: number;
  /** Erro se falhou */
  error?: string;
}

// ============================================================================
// Fingerprints Agrupados (v3.0.0)
// ============================================================================

/**
 * Fingerprints agrupados para ForensicMetadata v3.0.0
 *
 * Agrupa todos os fingerprints opcionais que requerem consentimento
 * sob um único objeto para melhor organização.
 *
 * @requirements 11.6
 */
export interface ForensicFingerprints {
  /** Fingerprint de Canvas */
  canvas?: CanvasFingerprint;

  /** Fingerprint WebGL */
  webgl?: WebGLFingerprint;

  /** Fingerprint de Fontes instaladas */
  fonts?: FontsInfo;
}

// ============================================================================
// Metadados Forenses Completos
// ============================================================================

/**
 * Metadados forenses completos para prova digital v3.0.0
 *
 * Agrupa todas as informações coletadas com suporte a:
 * - Geolocalização em 3 níveis (CloudFront, Browser, Enriched)
 * - Sistema de consentimento LGPD/GDPR
 * - Fingerprints agrupados
 *
 * @requirements 11.1, 11.2, 11.5, 11.6
 */
export interface ForensicMetadataV3 {
  /** Versão do schema de metadados (v3.0.0 para nova arquitetura) */
  schemaVersion: '3.0.0';

  /** ID único da captura */
  captureId: string;

  /** Timestamp da coleta (ISO 8601) */
  collectionTimestamp: string;

  /** Duração da coleta em ms */
  collectionDurationMs: number;

  // ========================================
  // Dados básicos (sempre coletados)
  // ========================================

  /** URL da página capturada */
  url: string;

  /** Título da página */
  title: string;

  /** User-Agent do navegador */
  userAgent: string;

  /** Versão da extensão */
  extensionVersion: string;

  // ========================================
  // Dados de captura
  // ========================================

  /** Dimensões do viewport */
  viewport: { width: number; height: number };

  /** Dimensões da página completa */
  pageSize: { width: number; height: number };

  /** Número de viewports capturados */
  viewportsCaptured: number;

  // ========================================
  // Geolocalização em 3 níveis (v3.0.0)
  // ========================================

  /** Geolocalização em 3 níveis: CloudFront, Browser, Enriched */
  geolocation: ForensicGeolocation;

  // ========================================
  // Dados de rede e dispositivo (sempre coletados)
  // ========================================

  /** Informações de rede */
  network?: NetworkInfo;

  /** Informações do dispositivo */
  device?: DeviceInfo;

  /** Evidências de timezone */
  timezone?: TimezoneEvidence;

  // ========================================
  // Dados de domínio (sempre coletados)
  // ========================================

  /** Certificado SSL/TLS */
  sslCertificate?: SSLCertificateInfo;

  /** Headers HTTP */
  httpHeaders?: HTTPHeadersInfo;

  /** Informações DNS */
  dns?: DNSInfo;

  /** Informações WHOIS */
  whois?: WHOISInfo;

  // ========================================
  // Dados de página (sempre coletados)
  // ========================================

  /** Cookies do domínio */
  cookies?: CookieInfo[];

  /** Informações de storage */
  storage?: StorageInfo;

  /** Recursos da página */
  pageResources?: PageResourcesSummary;

  /** Wayback Machine */
  waybackMachine?: WaybackMachineInfo;

  /** Métricas de performance */
  performance?: PerformanceMetrics;

  // ========================================
  // Fingerprints (opcionais, requerem consentimento)
  // ========================================

  /** Fingerprints agrupados (Canvas, WebGL, Fonts) - requerem consentimento */
  fingerprints?: ForensicFingerprints;

  // ========================================
  // Outros coletores (sempre coletados)
  // ========================================

  /** Dispositivos de mídia */
  mediaDevices?: MediaDevicesInfo;

  /** Service Workers */
  serviceWorkers?: ServiceWorkersInfo;

  /** Permissões do navegador */
  permissions?: PermissionsInfo;

  /** Carimbo de tempo */
  timestampAuthority?: TimestampAuthorityInfo;

  // ========================================
  // Hashes de integridade
  // ========================================

  /** Hashes de integridade */
  hashes: {
    /** Hash da imagem */
    imageHash?: string;
    /** Hash do HTML */
    htmlHash?: string;
    /** Hash dos metadados (sem este campo) */
    metadataHash?: string;
  };

  // ========================================
  // Consentimento LGPD/GDPR (v3.0.0)
  // ========================================

  /** Informações de consentimento do usuário */
  consent: ForensicConsentInfo;

  // ========================================
  // Modificações DOM (transparência forense)
  // ========================================

  /** Modificações temporárias realizadas no DOM durante captura */
  domModifications?: {
    /** Elementos sticky/fixed convertidos para absolute */
    stickyElements?: Array<{
      selector: string;
      tagName: string;
      originalPosition: string;
      newPosition: string;
      timestamp: number;
      justification: string;
    }>;
    /** Imagens lazy-loaded forçadas */
    lazyImages?: Array<{
      selector: string;
      originalState: Record<string, string | null>;
      modification: string;
      timestamp: number;
    }>;
  };

  // ========================================
  // Erros de coleta
  // ========================================

  /** Erros durante coleta de metadados */
  collectionErrors?: Record<string, string>;
}

/**
 * Metadados forenses legado (v2.x) - mantido para compatibilidade
 * @deprecated Use ForensicMetadataV3 para novas implementações
 */
export interface ForensicMetadataLegacy {
  /** Versão do schema de metadados */
  schemaVersion: string;
  /** ID único da captura */
  captureId: string;
  /** Timestamp da coleta (ISO 8601) */
  collectionTimestamp: string;
  /** Duração da coleta em ms */
  collectionDurationMs: number;

  // Dados básicos (já existentes)
  /** URL da página capturada */
  url: string;
  /** Título da página */
  title: string;
  /** User-Agent do navegador */
  userAgent: string;
  /** Versão da extensão */
  extensionVersion: string;

  // Dados de captura
  /** Dimensões do viewport */
  viewport: { width: number; height: number };
  /** Dimensões da página completa */
  pageSize: { width: number; height: number };
  /** Número de viewports capturados */
  viewportsCaptured: number;

  // Novos dados forenses
  /** Geolocalização (legado) */
  geolocation?: GeoLocationData;
  /** Informações de rede */
  network?: NetworkInfo;
  /** Certificado SSL/TLS */
  sslCertificate?: SSLCertificateInfo;
  /** Headers HTTP */
  httpHeaders?: HTTPHeadersInfo;
  /** Informações DNS */
  dns?: DNSInfo;
  /** Informações WHOIS */
  whois?: WHOISInfo;
  /** Informações do dispositivo */
  device?: DeviceInfo;
  /** Cookies do domínio */
  cookies?: CookieInfo[];
  /** Informações de storage */
  storage?: StorageInfo;
  /** Recursos da página */
  pageResources?: PageResourcesSummary;
  /** Wayback Machine */
  waybackMachine?: WaybackMachineInfo;
  /** Carimbo de tempo */
  timestampAuthority?: TimestampAuthorityInfo;
  /** Métricas de performance */
  performance?: PerformanceMetrics;
  /** Evidências de timezone */
  timezone?: TimezoneEvidence;
  /** Fingerprint de canvas */
  canvasFingerprint?: CanvasFingerprint;
  /** Fingerprint WebGL */
  webglFingerprint?: WebGLFingerprint;
  /** Dispositivos de mídia */
  mediaDevices?: MediaDevicesInfo;
  /** Fontes instaladas */
  fonts?: FontsInfo;
  /** Service Workers */
  serviceWorkers?: ServiceWorkersInfo;
  /** Permissões do navegador */
  permissions?: PermissionsInfo;

  // Hashes
  /** Hashes de integridade */
  hashes: {
    /** Hash da imagem */
    imageHash?: string;
    /** Hash do HTML */
    htmlHash?: string;
    /** Hash dos metadados (sem este campo) */
    metadataHash?: string;
    /** Hash de mídia (vídeo) */
    media?: string;
    /** Hash combinado de HTML */
    htmlCombined?: string;
  };

  // Modificações DOM (transparência forense)
  /** Modificações temporárias realizadas no DOM durante captura */
  domModifications?: {
    /** Elementos sticky/fixed convertidos para absolute */
    stickyElements?: Array<{
      selector: string;
      tagName: string;
      originalPosition: string;
      newPosition: string;
      timestamp: number;
      justification: string;
    }>;
    /** Imagens lazy-loaded forçadas */
    lazyImages?: Array<{
      selector: string;
      originalState: Record<string, string | null>;
      modification: string;
      timestamp: number;
    }>;
  };

  // Erros de coleta (campos que falharam)
  /** Erros durante coleta de metadados */
  collectionErrors?: Record<string, string>;

  /** Informações de captura de vídeo (quando aplicável) */
  videoCapture?: {
    /** Duração da captura em ms */
    durationMs: number;
    /** Número de chunks de vídeo */
    chunksCount: number;
    /** Número de navegações durante a captura */
    navigationsCount: number;
    /** URL inicial */
    startUrl: string;
    /** URL final */
    endUrl: string;
  };
}

/**
 * Configuração para coleta de metadados forenses
 */
export interface ForensicCollectionConfig {
  /** Coletar geolocalização */
  collectGeolocation: boolean;
  /** Coletar informações de rede */
  collectNetwork: boolean;
  /** Coletar certificado SSL */
  collectSSL: boolean;
  /** Coletar headers HTTP */
  collectHeaders: boolean;
  /** Coletar DNS */
  collectDNS: boolean;
  /** Coletar WHOIS */
  collectWHOIS: boolean;
  /** Coletar informações do dispositivo */
  collectDevice: boolean;
  /** Coletar cookies */
  collectCookies: boolean;
  /** Coletar storage */
  collectStorage: boolean;
  /** Coletar recursos da página */
  collectResources: boolean;
  /** Consultar Wayback Machine */
  collectWayback: boolean;
  /** Obter carimbo de tempo */
  collectTimestamp: boolean;
  /** Coletar métricas de performance */
  collectPerformance: boolean;
  /** Coletar evidências de timezone */
  collectTimezone: boolean;
  /** Coletar fingerprint de canvas */
  collectCanvasFingerprint: boolean;
  /** Coletar fingerprint WebGL */
  collectWebGLFingerprint: boolean;
  /** Coletar dispositivos de mídia */
  collectMediaDevices: boolean;
  /** Coletar fontes instaladas */
  collectFonts: boolean;
  /** Coletar Service Workers */
  collectServiceWorkers: boolean;
  /** Coletar permissões */
  collectPermissions: boolean;
  /** Timeout geral para coleta em ms */
  collectionTimeout: number;
  /** URL da TSA para carimbo de tempo */
  tsaUrl?: string;
}

/**
 * Configuração padrão para coleta forense
 */
export const DEFAULT_FORENSIC_CONFIG: ForensicCollectionConfig = {
  collectGeolocation: true,
  collectNetwork: true,
  collectSSL: true,
  collectHeaders: true,
  collectDNS: true,
  collectWHOIS: true,
  collectDevice: true,
  collectCookies: true,
  collectStorage: true,
  collectResources: true,
  collectWayback: true,
  collectTimestamp: true,
  collectPerformance: true,
  collectTimezone: true,
  collectCanvasFingerprint: true,
  collectWebGLFingerprint: true,
  collectMediaDevices: true,
  collectFonts: true,
  collectServiceWorkers: true,
  collectPermissions: true,
  collectionTimeout: 30000,
  tsaUrl: 'http://timestamp.digicert.com',
};

// ============================================================================
// Tipo Union para Compatibilidade
// ============================================================================

/**
 * Metadados forenses - aceita tanto v3.0.0 quanto versões legado
 *
 * Durante a migração, este tipo aceita ambas as estruturas.
 * Código novo deve usar ForensicMetadataV3 diretamente.
 *
 * @example
 * // Código legado (v2.x) - ainda funciona
 * const metadata: ForensicMetadata = {
 *   schemaVersion: '2.0.0',
 *   geolocation: { latitude: 0, longitude: 0, ... },
 *   canvasFingerprint: { ... },
 *   ...
 * };
 *
 * // Código novo (v3.0.0) - preferido
 * const metadata: ForensicMetadataV3 = {
 *   schemaVersion: '3.0.0',
 *   geolocation: { cloudfront: {...}, browser: {...}, sources: [...], ... },
 *   fingerprints: { canvas: {...}, webgl: {...}, fonts: {...} },
 *   consent: { config: {...}, timestamp: '...', version: '1.0' },
 *   ...
 * };
 */
export type ForensicMetadata = ForensicMetadataV3 | ForensicMetadataLegacy;

// ============================================================================
// Funções Utilitárias de Tipo
// ============================================================================

/**
 * Verifica se os metadados são da versão 3.0.0
 *
 * @param metadata - Metadados forenses
 * @returns true se for v3.0.0
 */
export function isForensicMetadataV3(
  metadata: ForensicMetadata
): metadata is ForensicMetadataV3 {
  return metadata.schemaVersion === '3.0.0';
}

/**
 * Verifica se os metadados são da versão legado (v2.x ou anterior)
 *
 * @param metadata - Metadados forenses
 * @returns true se for versão legado
 */
export function isForensicMetadataLegacy(
  metadata: ForensicMetadata
): metadata is ForensicMetadataLegacy {
  return metadata.schemaVersion !== '3.0.0';
}

/**
 * Cria uma estrutura ForensicGeolocation vazia
 *
 * @param consentGranted - Se o usuário concedeu consentimento
 * @returns Estrutura ForensicGeolocation com valores padrão
 */
export function createEmptyForensicGeolocation(
  consentGranted: boolean = false
): ForensicGeolocation {
  return {
    sources: [],
    consentGranted,
    collectionTimestamp: new Date().toISOString(),
  };
}

/**
 * Cria uma estrutura ForensicConsentInfo com valores padrão
 *
 * @param config - Configuração de consentimento (usa DEFAULT_CONSENT_CONFIG se não fornecido)
 * @returns Estrutura ForensicConsentInfo
 */
export function createForensicConsentInfo(
  config: ForensicConsentConfig = DEFAULT_CONSENT_CONFIG
): ForensicConsentInfo {
  return {
    config,
    timestamp: new Date().toISOString(),
    version: '1.0',
  };
}
