/**
 * Validação de origem para mensagens externas do service worker.
 *
 * Extrai a lógica de validação para facilitar testes e manter
 * a segurança de que localhost só é aceito em modo desenvolvimento.
 *
 * @module origin-validation
 */

/** Domínios permitidos para comunicação externa com a extensão */
export const ALLOWED_ORIGINS = [
  'https://app.lexato.com.br',
  'https://admin.lexato.com.br',
  'https://lexato.com.br',
  'https://www.lexato.com.br',
] as const;

/** Padrão regex para subdomínios lexato.com.br */
const LEXATO_SUBDOMAIN_PATTERN = /^https:\/\/[a-z0-9-]+\.lexato\.com\.br/;

/**
 * Verifica se a origem é um endereço de desenvolvimento (localhost/127.0.0.1).
 *
 * Em produção, `import.meta.env.DEV` é `false` e o bundler elimina
 * o branch, garantindo que `isDev` seja sempre `false`.
 *
 * @param origin - Origem da mensagem (pode ser undefined)
 * @param isDevMode - Valor de `import.meta.env.DEV`
 * @returns `true` apenas se estiver em modo dev E a origem for localhost
 */
export function isDevOrigin(origin: string | undefined, isDevMode: boolean): boolean {
  return isDevMode && (origin?.includes('localhost') === true || origin?.includes('127.0.0.1') === true);
}

/**
 * Verifica se a origem é permitida para comunicação externa.
 *
 * @param origin - Origem da mensagem (pode ser undefined)
 * @param isDevMode - Valor de `import.meta.env.DEV`
 * @returns `true` se a origem é autorizada
 */
export function isOriginAllowed(origin: string | undefined, isDevMode: boolean): boolean {
  if (!origin) return false;

  // Verificar domínios explícitos
  const isExplicitOrigin = ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
  if (isExplicitOrigin) return true;

  // Verificar subdomínios lexato.com.br
  if (LEXATO_SUBDOMAIN_PATTERN.test(origin)) return true;

  // Em desenvolvimento, aceitar localhost
  return isDevOrigin(origin, isDevMode);
}
