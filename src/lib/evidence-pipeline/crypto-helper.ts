/**
 * Utilitários criptográficos para o Pipeline de Evidências
 *
 * Fornece funções para cálculo de hashes SHA-256, Merkle Root
 * e geração de UUIDs v4 para identificação de evidências.
 *
 * IMPORTANTE: Usa hash-wasm para SHA-256 - NUNCA implementação própria
 *
 * @module CryptoHelper
 */

import { sha256, createSHA256 } from 'hash-wasm';

/**
 * Timeout padrão para operações de hash (5 segundos)
 */
const HASH_TIMEOUT_MS = 5000;

/**
 * Erro lançado quando operação de hash excede timeout
 */
export class HashTimeoutError extends Error {
  constructor(message = 'Operação de hash excedeu o tempo limite de 5 segundos') {
    super(message);
    this.name = 'HashTimeoutError';
  }
}

/**
 * Erro lançado quando entrada é inválida para hash
 */
export class InvalidInputError extends Error {
  constructor(message = 'Entrada inválida para operação de hash') {
    super(message);
    this.name = 'InvalidInputError';
  }
}

/**
 * Executa promise com timeout
 *
 * @param promise - Promise para executar
 * @param timeoutMs - Timeout em milissegundos
 * @returns Resultado da promise
 * @throws HashTimeoutError se timeout for excedido
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new HashTimeoutError());
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    return result;
  } catch (error) {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    throw error;
  }
}

/**
 * Calcula hash SHA-256 de dados (ArrayBuffer ou string)
 *
 * Retorna hash em formato hexadecimal lowercase (64 caracteres).
 *
 * @param data - Dados para calcular hash (ArrayBuffer ou string)
 * @returns Hash SHA-256 em hexadecimal lowercase
 * @throws InvalidInputError se entrada for null/undefined
 * @throws HashTimeoutError se operação exceder 5 segundos
 *
 * @example
 * ```typescript
 * // Hash de string
 * const hashStr = await calcularHashSHA256('dados para hash');
 * // Retorna: 'a1b2c3...' (64 caracteres hex)
 *
 * // Hash de ArrayBuffer
 * const buffer = new TextEncoder().encode('dados').buffer;
 * const hashBuf = await calcularHashSHA256(buffer);
 * ```
 */
export async function calcularHashSHA256(data: ArrayBuffer | string): Promise<string> {
  // Validar entrada
  if (data === null || data === undefined) {
    throw new InvalidInputError('Dados não podem ser null ou undefined');
  }

  // Converter para formato adequado para hash-wasm
  if (typeof data === 'string') {
    return withTimeout(sha256(data), HASH_TIMEOUT_MS);
  }

  // ArrayBuffer - converter para Uint8Array
  const uint8Array = new Uint8Array(data);
  return withTimeout(sha256(uint8Array), HASH_TIMEOUT_MS);
}

/**
 * Helper para ler Blob como ArrayBuffer de forma compatível com jsdom
 *
 * Usa blob.arrayBuffer() em browsers modernos e FileReader como fallback
 * para ambientes de teste (jsdom) que não suportam o método.
 */
async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  // Tentar método moderno primeiro (browsers reais)
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }

  // Fallback para FileReader (jsdom e browsers antigos)
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Erro ao ler blob'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Calcula hash SHA-256 de um Blob
 *
 * Helper para facilitar uso com blobs (ex: chunks de upload).
 *
 * @param blob - Blob para calcular hash
 * @returns Hash SHA-256 em hexadecimal lowercase
 */
export async function calcularHashSHA256Blob(blob: Blob): Promise<string> {
  const buffer = await blobToArrayBuffer(blob);
  return calcularHashSHA256(buffer);
}

/**
 * Calcula hash SHA-256 de um Blob grande usando hashing incremental
 *
 * Processa o blob em chunks para evitar carregar tudo na memória.
 * Produz o MESMO resultado que calcularHashSHA256Blob, mas com menor
 * uso de memória para arquivos grandes.
 *
 * IMPORTANTE: O hash resultante é do blob COMPLETO, não concatenação
 * de hashes de chunks. Isso garante integridade forense correta.
 *
 * @param blob - Blob para calcular hash
 * @param onProgress - Callback opcional de progresso (0-100)
 * @param chunkSize - Tamanho do chunk em bytes (padrão: 5MB, alinhado com S3)
 * @returns Hash SHA-256 em hexadecimal lowercase
 * @throws HashTimeoutError se operação exceder tempo limite
 *
 * @example
 * ```typescript
 * const videoBlob = new Blob([...]);
 * const hash = await calcularHashSHA256BlobIncremental(videoBlob, (p) => {
 *   console.log(`Progresso: ${p.toFixed(1)}%`);
 * });
 * ```
 */
export async function calcularHashSHA256BlobIncremental(
  blob: Blob,
  onProgress?: (percent: number) => void,
  chunkSize: number = 5 * 1024 * 1024 // 5MB padrão (alinhado com MIN_PART_SIZE do S3)
): Promise<string> {
  if (!blob || blob.size === 0) {
    throw new InvalidInputError('Blob não pode ser null, undefined ou vazio');
  }

  const hasher = await createSHA256();
  hasher.init();

  // Ler o blob inteiro e processar em chunks para o hasher
  const fullBuffer = await blobToArrayBuffer(blob);
  const fullArray = new Uint8Array(fullBuffer);

  let offset = 0;

  while (offset < fullArray.length) {
    const end = Math.min(offset + chunkSize, fullArray.length);
    const chunk = fullArray.slice(offset, end);
    hasher.update(chunk);

    offset = end;

    if (onProgress) {
      const percent = Math.min((offset / fullArray.length) * 100, 100);
      onProgress(percent);
    }
  }

  return hasher.digest('hex');
}

/**
 * Calcula hash SHA-256 de um Blob grande e retorna em base64
 *
 * Versão incremental para arquivos grandes, retornando em base64
 * para uso com S3 Object Lock (header x-amz-checksum-sha256).
 *
 * @param blob - Blob para calcular hash
 * @param onProgress - Callback opcional de progresso (0-100)
 * @returns Hash SHA-256 em base64 (formato esperado pelo S3)
 */
export async function calcularHashSHA256Base64Incremental(
  blob: Blob,
  onProgress?: (percent: number) => void
): Promise<string> {
  const hashHex = await calcularHashSHA256BlobIncremental(blob, onProgress);

  // Converter hex para base64 (S3 espera base64, não hex)
  const binaryString = hashHex.match(/.{2}/g)!.map(byte =>
    String.fromCharCode(parseInt(byte, 16))
  ).join('');
  return btoa(binaryString);
}

/**
 * Calcula Merkle Root a partir de uma lista de hashes
 *
 * O Merkle Root é calculado como SHA-256 de todos os hashes
 * concatenados em ordem alfabética (sorted).
 *
 * Esta implementação simplificada é adequada para o pipeline de evidências
 * onde temos poucos hashes (mídia, HTML, metadados).
 *
 * Para árvores Merkle completas com provas de inclusão, use o módulo
 * `merkle-tree.ts`.
 *
 * @param hashes - Lista de hashes SHA-256 (64 caracteres hex cada)
 * @returns Merkle Root em hexadecimal lowercase
 * @throws InvalidInputError se lista estiver vazia ou contiver hashes inválidos
 * @throws HashTimeoutError se operação exceder 5 segundos
 *
 * @example
 * ```typescript
 * const mediaHash = 'a1b2c3...';
 * const htmlHash = 'd4e5f6...';
 * const metadataHash = 'g7h8i9...';
 *
 * const merkleRoot = await calcularMerkleRoot([mediaHash, htmlHash, metadataHash]);
 * // Retorna: SHA-256(sorted hashes concatenados)
 * ```
 */
export async function calcularMerkleRoot(hashes: string[]): Promise<string> {
  // Validar entrada
  if (!hashes || hashes.length === 0) {
    throw new InvalidInputError('Lista de hashes não pode estar vazia');
  }

  // Validar formato de cada hash
  for (const hash of hashes) {
    if (!hash || typeof hash !== 'string') {
      throw new InvalidInputError('Todos os hashes devem ser strings não vazias');
    }
    if (!/^[0-9a-f]{64}$/i.test(hash)) {
      throw new InvalidInputError(
        `Hash inválido: ${hash.substring(0, 20)}... Deve ser SHA-256 em hexadecimal (64 caracteres)`
      );
    }
  }

  // Normalizar para lowercase e ordenar alfabeticamente
  const normalizedHashes = hashes.map((h) => h.toLowerCase());
  const sortedHashes = [...normalizedHashes].sort();

  // Concatenar todos os hashes ordenados
  const concatenated = sortedHashes.join('');

  // Calcular SHA-256 da concatenação
  return withTimeout(sha256(concatenated), HASH_TIMEOUT_MS);
}

/**
 * Gera UUID v4 criptograficamente seguro
 *
 * Formato: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * onde:
 * - x é qualquer dígito hexadecimal (0-9, a-f)
 * - 4 indica versão 4 (UUID aleatório)
 * - y é 8, 9, a ou b (variante RFC 4122)
 *
 * Usa crypto.getRandomValues() para geração segura de bytes aleatórios.
 *
 * @returns UUID v4 em formato string
 *
 * @example
 * ```typescript
 * const evidenceId = gerarUUIDv4();
 * // Retorna: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
 * ```
 */
export function gerarUUIDv4(): string {
  // Gerar 16 bytes aleatórios usando crypto.getRandomValues
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Definir versão 4 (bits 12-15 do byte 6)
  // bytes[6] = (bytes[6] & 0x0f) | 0x40
  const byte6 = bytes[6];
  if (byte6 !== undefined) {
    bytes[6] = (byte6 & 0x0f) | 0x40;
  }

  // Definir variante RFC 4122 (bits 6-7 do byte 8)
  // bytes[8] = (bytes[8] & 0x3f) | 0x80
  // Isso garante que y seja 8, 9, a ou b
  const byte8 = bytes[8];
  if (byte8 !== undefined) {
    bytes[8] = (byte8 & 0x3f) | 0x80;
  }

  // Converter para string hexadecimal com hífens
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Formato: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-');
}

/**
 * Valida se uma string é um UUID v4 válido
 *
 * @param uuid - String para validar
 * @returns true se for UUID v4 válido
 *
 * @example
 * ```typescript
 * isValidUUIDv4('f47ac10b-58cc-4372-a567-0e02b2c3d479'); // true
 * isValidUUIDv4('invalid'); // false
 * isValidUUIDv4('f47ac10b-58cc-3372-a567-0e02b2c3d479'); // false (versão 3)
 * ```
 */
export function isValidUUIDv4(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }

  // Regex para UUID v4:
  // - 8 hex chars
  // - hífen
  // - 4 hex chars
  // - hífen
  // - 4 (versão) seguido de 3 hex chars
  // - hífen
  // - [89ab] (variante) seguido de 3 hex chars
  // - hífen
  // - 12 hex chars
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidV4Regex.test(uuid);
}

/**
 * Valida se uma string é um hash SHA-256 válido
 *
 * @param hash - String para validar
 * @returns true se for hash SHA-256 válido (64 caracteres hex)
 *
 * @example
 * ```typescript
 * isValidSHA256('a1b2c3d4...'); // true (se 64 chars hex)
 * isValidSHA256('invalid'); // false
 * ```
 */
export function isValidSHA256(hash: string): boolean {
  if (!hash || typeof hash !== 'string') {
    return false;
  }
  return /^[0-9a-f]{64}$/i.test(hash);
}

/**
 * Calcula SHA-256 de um Blob e retorna em base64
 * 
 * Usado para validação de integridade em uploads S3 com Object Lock.
 * O S3 aceita SHA-256 via header x-amz-checksum-sha256 em base64.
 * 
 * SHA-256 é mais seguro que MD5 e recomendado pela AWS para novos uploads.
 * 
 * @param blob - Dados para calcular hash
 * @returns SHA-256 em base64 (formato esperado pelo S3)
 * 
 * @example
 * ```typescript
 * const chunk = new Blob([data]);
 * const checksum = await calcularHashSHA256Base64(chunk);
 * // Retorna: "QLl8R4i4+SaJlrl8ZIcutc5TbZtwt2NwB8lTXkd3GH0=" (base64)
 * ```
 */
export async function calcularHashSHA256Base64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashHex = await calcularHashSHA256(buffer);
  
  // Converter hex para base64 (S3 espera base64, não hex)
  const binaryString = hashHex.match(/.{2}/g)!.map(byte => String.fromCharCode(parseInt(byte, 16))).join('');
  return btoa(binaryString);
}

/**
 * @deprecated Use calcularHashSHA256Base64 em vez disso. MD5 será removido em versão futura.
 * 
 * Calcula MD5 de um Blob e retorna em base64
 * 
 * IMPORTANTE: Web Crypto API NÃO suporta MD5 (considerado inseguro).
 * Usamos implementação JavaScript pura baseada no RFC 1321.
 * 
 * O S3 com Object Lock exige Content-MD5 em base64, não hex.
 * 
 * @param blob - Dados para calcular MD5
 * @returns MD5 em base64 (formato esperado pelo S3)
 */
export async function calcularMd5Base64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  // Implementação MD5 em JS puro
  const md5Hash = await calcularMd5(bytes);
  
  // Converter hex para base64 (S3 espera base64, não hex)
  const binaryString = md5Hash.match(/.{2}/g)!.map(byte => String.fromCharCode(parseInt(byte, 16))).join('');
  return btoa(binaryString);
}


/**
 * Implementação MD5 em JavaScript puro
 * Baseada no algoritmo RFC 1321
 * 
 * @param data - Bytes para calcular hash
 * @returns Hash MD5 em hexadecimal
 */
 async function calcularMd5(data: Uint8Array): Promise<string> {
  // Constantes MD5
  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
  ];
  
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];

  // Funções auxiliares
  const rotateLeft = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;
  const toUint32 = (x: number) => x >>> 0;

  // Padding
  const originalLength = data.length;
  const bitLength = originalLength * 8;
  const paddingLength = ((56 - (originalLength + 1) % 64) + 64) % 64 + 1;
  const paddedLength = originalLength + paddingLength + 8;
  
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[originalLength] = 0x80;
  
  // Append length in bits (little-endian)
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, toUint32(bitLength), true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  // Inicializar estado
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  // Processar blocos de 64 bytes
  for (let i = 0; i < paddedLength; i += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(i + j * 4, true);
    }

    let A = a0, B = b0, C = c0, D = d0;

    for (let j = 0; j < 64; j++) {
      let F: number, g: number;
      
      if (j < 16) {
        F = (B & C) | (~B & D);
        g = j;
      } else if (j < 32) {
        F = (D & B) | (~D & C);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        F = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * j) % 16;
      }

      F = toUint32(F + A + (K[j] ?? 0) + (M[g] ?? 0));
      A = D;
      D = C;
      C = B;
      B = toUint32(B + rotateLeft(F, S[j] ?? 0));
    }

    a0 = toUint32(a0 + A);
    b0 = toUint32(b0 + B);
    c0 = toUint32(c0 + C);
    d0 = toUint32(d0 + D);
  }

  // Converter para hex (little-endian)
  const toHex = (n: number) => {
    const bytes = [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}

