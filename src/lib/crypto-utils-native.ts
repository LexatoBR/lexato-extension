/**
 * Utilitários criptográficos nativos para content scripts
 *
 * IMPORTANTE: Esta versão usa Web Crypto API nativa do navegador
 * em vez de hash-wasm, pois content scripts rodam no contexto
 * da página web e estão sujeitos ao CSP da página (que pode
 * bloquear WebAssembly).
 *
 * Use esta versão em content scripts.
 * Use crypto-utils.ts (com hash-wasm) no service worker e popup.
 *
 * @module CryptoUtilsNative
 */

/**
 * Timeout padrão para operações de hash (5 segundos)
 */
const HASH_TIMEOUT_MS = 5000;

/**
 * Tamanho mínimo do nonce em bytes (128 bits = 16 bytes)
 */
const MIN_NONCE_BYTES = 16;

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
 * Utilitários criptográficos usando Web Crypto API nativa
 *
 * Funcionalidades:
 * - Hash SHA-256 com Web Crypto API (funciona em qualquer contexto)
 * - Geração de nonces com crypto.getRandomValues
 * - Conversões hex/array/base64
 * - Timeout de 5 segundos para operações de hash
 */
export class CryptoUtilsNative {
  /**
   * Calcula hash SHA-256 de uma string ou objeto usando Web Crypto API
   *
   * @param input - String ou objeto para calcular hash
   * @returns Hash em hexadecimal lowercase
   * @throws InvalidInputError se entrada for null/undefined
   * @throws HashTimeoutError se operação exceder 5 segundos
   */
  static async hash(input: string | object): Promise<string> {
    // Validar entrada
    if (input === null || input === undefined) {
      throw new InvalidInputError('Entrada não pode ser null ou undefined');
    }

    // Converter objeto para string JSON com chaves ordenadas
    const data = typeof input === 'string' ? input : CryptoUtilsNative.stringifyOrdered(input);

    // Executar hash com timeout usando Web Crypto API
    return CryptoUtilsNative.withTimeout(CryptoUtilsNative.sha256Native(data), HASH_TIMEOUT_MS);
  }

  /**
   * Calcula SHA-256 usando Web Crypto API nativa
   *
   * @param data - String para calcular hash
   * @returns Hash em hexadecimal lowercase
   */
  private static async sha256Native(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return CryptoUtilsNative.arrayToHex(new Uint8Array(hashBuffer));
  }

  /**
   * Calcula hash SHA-256 de um ArrayBuffer ou Uint8Array
   *
   * @param buffer - Buffer para calcular hash
   * @returns Hash em hexadecimal lowercase
   * @throws InvalidInputError se entrada for null/undefined
   * @throws HashTimeoutError se operação exceder 5 segundos
   */
  static async hashBuffer(buffer: ArrayBuffer | Uint8Array): Promise<string> {
    // Validar entrada
    if (buffer === null || buffer === undefined) {
      throw new InvalidInputError('Buffer não pode ser null ou undefined');
    }

    // Converter para ArrayBuffer puro (evita SharedArrayBuffer e views parciais)
    const data: ArrayBuffer = buffer instanceof Uint8Array
      ? (buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer)
      : buffer;

    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return CryptoUtilsNative.arrayToHex(new Uint8Array(hashBuffer));
  }

  /**
   * Calcula hash SHA-256 de um arquivo grande em chunks
   *
   * @param data - Dados para calcular hash (Blob, ArrayBuffer ou Uint8Array)
   * @param _chunkSize - Ignorado (mantido para compatibilidade de API)
   * @returns Hash em hexadecimal lowercase
   */
  static async hashLargeData(
    data: Blob | ArrayBuffer | Uint8Array,
    _chunkSize = 1024 * 1024
  ): Promise<string> {
    if (data === null || data === undefined) {
      throw new InvalidInputError('Dados não podem ser null ou undefined');
    }

    // Para Blob, converter para ArrayBuffer
    if (data instanceof Blob) {
      const arrayBuffer = await data.arrayBuffer();
      return CryptoUtilsNative.hashBuffer(arrayBuffer);
    }

    return CryptoUtilsNative.hashBuffer(data);
  }

  /**
   * Gera nonce criptograficamente seguro
   *
   * @param bytes - Número de bytes (mínimo 16 = 128 bits)
   * @returns Uint8Array com bytes aleatórios
   * @throws Error se bytes < 16
   */
  static generateNonce(bytes = MIN_NONCE_BYTES): Uint8Array {
    if (bytes < MIN_NONCE_BYTES) {
      throw new Error(`Nonce deve ter no mínimo ${MIN_NONCE_BYTES} bytes (128 bits)`);
    }

    const nonce = new Uint8Array(bytes);
    crypto.getRandomValues(nonce);
    return nonce;
  }

  /**
   * Converte Uint8Array para string hexadecimal lowercase
   *
   * @param array - Array de bytes
   * @returns String hexadecimal lowercase
   */
  static arrayToHex(array: Uint8Array): string {
    return Array.from(array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Converte string hexadecimal para Uint8Array
   *
   * @param hex - String hexadecimal
   * @returns Uint8Array
   * @throws Error se hex tiver tamanho ímpar ou caracteres inválidos
   */
  static hexToArray(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
      throw new Error('String hexadecimal deve ter tamanho par');
    }

    const normalizedHex = hex.toLowerCase();
    if (!/^[0-9a-f]*$/.test(normalizedHex)) {
      throw new Error('String hexadecimal contém caracteres inválidos');
    }

    const length = Math.floor(hex.length / 2);
    const array = new Uint8Array(length);
    for (let i = 0; i < hex.length; i += 2) {
      const byteValue = parseInt(hex.substring(i, i + 2), 16);
      const index = Math.floor(i / 2);
      array[index] = byteValue;
    }
    return array;
  }

  /**
   * Converte ArrayBuffer para string Base64
   *
   * @param buffer - ArrayBuffer para converter
   * @returns String Base64
   */
  static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const length = bytes.byteLength;
    for (let i = 0; i < length; i++) {
      const byte = bytes[i];
      if (byte !== undefined) {
        binary += String.fromCharCode(byte);
      }
    }
    return btoa(binary);
  }

  /**
   * Converte string Base64 para ArrayBuffer
   *
   * @param base64 - String Base64 para converter
   * @returns ArrayBuffer
   */
  static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Converte Uint8Array para string Base64
   *
   * @param array - Uint8Array para converter
   * @returns String Base64
   */
  static uint8ArrayToBase64(array: Uint8Array): string {
    return CryptoUtilsNative.arrayBufferToBase64(array.buffer as ArrayBuffer);
  }

  /**
   * Converte string Base64 para Uint8Array
   *
   * @param base64 - String Base64 para converter
   * @returns Uint8Array
   */
  static base64ToUint8Array(base64: string): Uint8Array {
    return new Uint8Array(CryptoUtilsNative.base64ToArrayBuffer(base64));
  }

  /**
   * Serializa objeto JSON com chaves ordenadas alfabeticamente
   *
   * @param obj - Objeto para serializar
   * @returns String JSON com chaves ordenadas
   */
  static stringifyOrdered(obj: object): string {
    return JSON.stringify(CryptoUtilsNative.sortObjectKeys(obj));
  }

  /**
   * Ordena chaves de um objeto recursivamente
   *
   * @param obj - Objeto para ordenar chaves
   * @returns Objeto com chaves ordenadas
   */
  private static sortObjectKeys(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => CryptoUtilsNative.sortObjectKeys(item));
    }

    const sortedKeys = Object.keys(obj as object).sort();
    const result: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      result[key] = CryptoUtilsNative.sortObjectKeys((obj as Record<string, unknown>)[key]);
    }

    return result;
  }

  /**
   * Executa promise com timeout
   *
   * @param promise - Promise para executar
   * @param timeoutMs - Timeout em milissegundos
   * @returns Resultado da promise
   * @throws HashTimeoutError se timeout for excedido
   */
  private static async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
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
}

// Alias para compatibilidade - permite trocar facilmente nos imports
export const CryptoUtils = CryptoUtilsNative;

export default CryptoUtilsNative;
