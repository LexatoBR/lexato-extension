/**
 * Construtor de Content Security Policy (CSP) condicional por ambiente.
 *
 * Módulo puro (sem dependências externas) que gera a string CSP
 * para o manifest da extensão Chrome Lexato, baseado no modo de build.
 *
 * Separado do manifest.ts para permitir testes unitários sem
 * dependência do @crxjs/vite-plugin (que puxa esbuild).
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 9.1, 9.2, 9.3
 */

// ---------------------------------------------------------------------------
// Diretivas base de segurança (sempre presentes em qualquer ambiente)
// ---------------------------------------------------------------------------

/**
 * CSP base: restringe execução de scripts e plugins.
 * - script-src 'self': apenas scripts da própria extensão
 * - wasm-unsafe-eval: permite WebAssembly para hash-wasm (SHA-256, Merkle tree)
 * - object-src 'self': bloqueia plugins externos (Flash, Java, etc.)
 */
export const CSP_BASE = "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'";

// ---------------------------------------------------------------------------
// Domínios de produção agrupados por categoria funcional
// ---------------------------------------------------------------------------

/**
 * Domínios de produção organizados por categoria.
 * Cada grupo possui justificativa para facilitar revisão na Chrome Web Store.
 *
 * Categorias:
 * - API principal Lexato + Supabase via domínio customizado (auth.lexato.com.br)
 * - Armazenamento e WebSocket AWS (S3 presigned URLs + API Gateway)
 * - Monitoramento de erros (Sentry)
 * - Coleta forense de metadados (IP, DNS, WHOIS, Wayback Machine)
 * - Blockchain RPCs para certificação (triplo registro de hash)
 */
export const CSP_CONNECT_PRODUCTION_DOMAINS: readonly string[] = [
  // API principal Lexato + Supabase via domínio customizado (REST, Auth, Realtime, Storage)
  // O Supabase opera sob auth.lexato.com.br (custom domain), sem expor *.supabase.co
  'https://*.lexato.com.br',
  'wss://*.lexato.com.br',

  // Armazenamento e WebSocket AWS (S3 presigned URLs + API Gateway)
  'https://*.s3.sa-east-1.amazonaws.com',
  'https://*.execute-api.sa-east-1.amazonaws.com',
  'wss://*.execute-api.sa-east-1.amazonaws.com',

  // Monitoramento de erros (Sentry - captura de exceções em produção)
  'https://*.sentry.io',
  'https://*.ingest.sentry.io',
  'https://*.ingest.us.sentry.io',

  // Coleta forense de metadados (IP, DNS, Wayback Machine)
  // WHOIS/SSL agora via backend proxy (api.lexato.com.br) - sem chamadas diretas
  'https://ipinfo.io',
  'https://ip-api.com',
  'https://dns.google',
  'https://cloudflare-dns.com',
  'https://archive.org',
  'https://web.archive.org',

  // Blockchain RPCs para certificação (triplo registro de hash)
  // Polygon PoS (primário), Arbitrum One (secundário), Optimism (terciário/Merkle)
  'https://polygon-rpc.com',
  'https://*.polygon-rpc.com',
  'https://arb1.arbitrum.io',
  'https://*.arbitrum.io',
  'https://mainnet.optimism.io',
  'https://*.optimism.io',
] as const;

/**
 * Domínios de produção concatenados em uma string para uso no CSP.
 */
export const CSP_CONNECT_PRODUCTION = CSP_CONNECT_PRODUCTION_DOMAINS.join(' ');

// ---------------------------------------------------------------------------
// Domínios adicionais para desenvolvimento local
// ---------------------------------------------------------------------------

/**
 * Domínios de desenvolvimento local (HMR, API local, WebSocket dev).
 * Incluídos APENAS em modo development, NUNCA em produção.
 */
export const CSP_CONNECT_DEV = 'http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*';

/**
 * Padrões de localhost que NÃO devem aparecer no CSP de produção.
 * Usado para validação e testes.
 */
export const LOCALHOST_PATTERNS = [
  'http://localhost:',
  'ws://localhost:',
  'http://127.0.0.1:',
  'ws://127.0.0.1:',
] as const;

// ---------------------------------------------------------------------------
// Funções de construção do CSP
// ---------------------------------------------------------------------------

/**
 * Constrói a diretiva connect-src do CSP baseada no modo de build.
 *
 * @param isDev - true se o modo é development, false para production
 * @returns Diretiva connect-src completa
 */
export function buildConnectSrc(isDev: boolean): string {
  return isDev
    ? `connect-src 'self' ${CSP_CONNECT_PRODUCTION} ${CSP_CONNECT_DEV}`
    : `connect-src 'self' ${CSP_CONNECT_PRODUCTION}`;
}

/**
 * Constrói a string CSP completa para extension_pages.
 *
 * Formato: "script-src ...; object-src ...; connect-src ..."
 *
 * @param isDev - true se o modo é development, false para production
 * @returns String CSP completa para uso no manifest
 */
export function buildCSP(isDev: boolean): string {
  const connectSrc = buildConnectSrc(isDev);
  return `${CSP_BASE}; ${connectSrc}`;
}
