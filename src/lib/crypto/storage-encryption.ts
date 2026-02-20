/**
 * Módulo de criptografia para chrome.storage
 *
 * Fornece criptografia AES-256-GCM para dados sensíveis armazenados
 * no chrome.storage.local, protegendo tokens JWT contra extração
 * por malware com acesso ao perfil do Chrome.
 *
 * A chave de criptografia é derivada do ID da extensão (estável e único)
 * combinado com um salt aleatório gerado na instalação.
 *
 * @module StorageEncryption
 */

/** Chave no storage para o salt de derivação */
const SALT_STORAGE_KEY = 'lexato_encryption_salt';

/** Algoritmo de criptografia */
const ALGORITHM = 'AES-GCM';

/** Tamanho do IV em bytes (96 bits recomendado para AES-GCM) */
const IV_LENGTH = 12;

/** Iterações para PBKDF2 */
const PBKDF2_ITERATIONS = 100_000;

/** Cache da chave derivada para evitar re-derivação */
let cachedKey: CryptoKey | null = null;
let cachedSalt: Uint8Array | null = null;

/**
 * Obtém ou gera o salt de derivação
 *
 * O salt é gerado uma vez na instalação e armazenado no chrome.storage.local.
 * Isso garante que a chave derivada seja consistente entre sessões.
 */
async function getOrCreateSalt(): Promise<Uint8Array> {
  if (cachedSalt) {
    return cachedSalt;
  }

  const result = await chrome.storage.local.get(SALT_STORAGE_KEY);
  const stored = result[SALT_STORAGE_KEY] as number[] | undefined;

  if (stored && Array.isArray(stored) && stored.length === 32) {
    cachedSalt = new Uint8Array(stored);
    return cachedSalt;
  }

  // Gerar novo salt (256 bits)
  const salt = crypto.getRandomValues(new Uint8Array(32));
  await chrome.storage.local.set({ [SALT_STORAGE_KEY]: Array.from(salt) });
  cachedSalt = salt;
  return salt;
}

/**
 * Deriva chave AES-256 a partir do ID da extensão + salt
 *
 * Usa PBKDF2 com 100.000 iterações para derivação segura.
 * O ID da extensão é estável e único por instalação.
 */
async function deriveKey(): Promise<CryptoKey> {
  if (cachedKey) {
    return cachedKey;
  }

  const salt = await getOrCreateSalt();
  const extensionId = chrome.runtime.id;

  // Importar o ID da extensão como material de chave
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(extensionId),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derivar chave AES-256-GCM
  cachedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return cachedKey;
}

/**
 * Criptografa um valor string com AES-256-GCM
 *
 * @param plaintext - Texto a criptografar
 * @returns String codificada em base64 contendo IV + ciphertext
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );

  // Concatenar IV + ciphertext e codificar em base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Descriptografa um valor criptografado com AES-256-GCM
 *
 * @param encryptedBase64 - String base64 contendo IV + ciphertext
 * @returns Texto original descriptografado
 * @throws {Error} Se a descriptografia falhar (dados corrompidos ou chave incorreta)
 */
export async function decrypt(encryptedBase64: string): Promise<string> {
  const key = await deriveKey();

  // Decodificar base64
  const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));

  // Extrair IV e ciphertext
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Verifica se um valor parece estar criptografado (base64 válido com tamanho mínimo)
 *
 * Usado para migração transparente: valores antigos (não criptografados)
 * são retornados como estão, valores novos são descriptografados.
 *
 * @param value - Valor a verificar
 * @returns true se o valor parece estar criptografado
 */
export function isEncrypted(value: string): boolean {
  // Valores criptografados são base64 e têm pelo menos IV_LENGTH + 1 byte
  // Um JWT começa com "ey" (base64 de '{"'), então não colide
  if (!value || value.startsWith('ey') || value.startsWith('{')) {
    return false;
  }

  try {
    const decoded = atob(value);
    // Deve ter pelo menos IV (12 bytes) + algum ciphertext
    return decoded.length > IV_LENGTH + 16;
  } catch {
    return false;
  }
}

/**
 * Limpa cache de chave (para testes)
 */
export function clearKeyCache(): void {
  cachedKey = null;
  cachedSalt = null;
}
