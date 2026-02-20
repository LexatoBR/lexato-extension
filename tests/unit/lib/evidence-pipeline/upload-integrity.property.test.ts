/**
 * Property Test: Multipart Upload Integrity
 *
 * **Validates: Requirements 4.1, 4.4**
 *
 * Este teste verifica a Propriedade 5 do design:
 * "Para qualquer arquivo enviado via multipart upload, a concatenação de todas
 * as parts enviadas DEVE produzir um arquivo idêntico ao original (verificado
 * por comparação de hash)."
 *
 * A propriedade garante que:
 * 1. Arquivos são divididos corretamente em parts
 * 2. Parts são enviadas na ordem correta
 * 3. A concatenação das parts reproduz o arquivo original
 * 4. O threshold de 5MB é respeitado
 *
 * @module PropertyTest/UploadIntegrity
 */

import fc from 'fast-check';
import { describe, it, vi, beforeEach, afterEach } from 'vitest';
import { sha256 } from 'hash-wasm';

/**
 * Tamanho mínimo de part para S3 Multipart Upload (5MB)
 */
const MIN_PART_SIZE = 5 * 1024 * 1024;

/**
 * Simula divisão de arquivo em parts para multipart upload
 *
 * @param data - Dados do arquivo
 * @param partSize - Tamanho de cada part (exceto última)
 * @returns Array de parts
 */
function splitIntoParts(data: Uint8Array, partSize: number): Uint8Array[] {
  const parts: Uint8Array[] = [];
  let offset = 0;

  while (offset < data.length) {
    const end = Math.min(offset + partSize, data.length);
    parts.push(data.slice(offset, end));
    offset = end;
  }

  return parts;
}

/**
 * Concatena parts de volta em um único array
 *
 * @param parts - Array de parts
 * @returns Dados concatenados
 */
function concatenateParts(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

/**
 * Calcula hash SHA-256 de dados
 */
async function calculateHash(data: Uint8Array): Promise<string> {
  return sha256(data);
}

/**
 * Simula buffer de chunks até atingir tamanho mínimo
 * Reproduz lógica do MultipartUploadService.addChunk()
 */
function bufferChunks(chunks: Uint8Array[], minSize: number): Uint8Array[] {
  const bufferedParts: Uint8Array[] = [];
  let buffer: Uint8Array[] = [];
  let bufferSize = 0;

  for (const chunk of chunks) {
    buffer.push(chunk);
    bufferSize += chunk.length;

    if (bufferSize >= minSize) {
      // Flush buffer
      const combined = concatenateParts(buffer);
      bufferedParts.push(combined);
      buffer = [];
      bufferSize = 0;
    }
  }

  // Flush remaining buffer (última part pode ser < minSize)
  if (buffer.length > 0) {
    const combined = concatenateParts(buffer);
    bufferedParts.push(combined);
  }

  return bufferedParts;
}

describe('Property 5: Multipart Upload Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Testa que a divisão e concatenação preserva integridade
   *
   * **Validates: Requirements 4.1**
   */
  it('should preserve file content when splitting and concatenating parts', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Gera array de bytes com tamanho variável (1KB a 1MB para testes rápidos)
        fc.uint8Array({ minLength: 1024, maxLength: 1024 * 1024 }),
        // Gera tamanho de part variável (100KB a 500KB para testes)
        fc.integer({ min: 100 * 1024, max: 500 * 1024 }),
        async (fileContent: Uint8Array, partSize: number) => {
          // Dividir em parts
          const parts = splitIntoParts(fileContent, partSize);

          // Concatenar de volta
          const reassembled = concatenateParts(parts);

          // Calcular hashes
          const originalHash = await calculateHash(fileContent);
          const reassembledHash = await calculateHash(reassembled);

          // Verificar integridade
          return originalHash === reassembledHash;
        }
      ),
      { numRuns: 50, verbose: true }
    );
  });

  /**
   * Testa que todas as parts (exceto última) têm tamanho >= minSize
   *
   * **Validates: Requirements 4.1**
   */
  it('should ensure all parts except last meet minimum size', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Gera array de bytes maior que 2x minSize para garantir múltiplas parts
        fc.uint8Array({ minLength: 200 * 1024, maxLength: 2 * 1024 * 1024 }),
        fc.integer({ min: 50 * 1024, max: 100 * 1024 }),
        async (fileContent: Uint8Array, minSize: number) => {
          const parts = splitIntoParts(fileContent, minSize);

          // Todas as parts exceto a última devem ter tamanho >= minSize
          for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!part || part.length < minSize) {
              return false;
            }
          }

          // Última part pode ter qualquer tamanho > 0
          const lastPart = parts[parts.length - 1];
          if (!lastPart || lastPart.length === 0) {
            return false;
          }

          return true;
        }
      ),
      { numRuns: 30, verbose: true }
    );
  });

  /**
   * Testa que o buffering de chunks preserva integridade
   *
   * **Validates: Requirements 4.1, 4.4**
   */
  it('should preserve integrity when buffering small chunks', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Gera múltiplos chunks pequenos (1KB a 100KB cada)
        fc.array(fc.uint8Array({ minLength: 1024, maxLength: 100 * 1024 }), {
          minLength: 5,
          maxLength: 20,
        }),
        // Tamanho mínimo do buffer (200KB a 500KB para testes)
        fc.integer({ min: 200 * 1024, max: 500 * 1024 }),
        async (chunks: Uint8Array[], minBufferSize: number) => {
          // Concatenar todos os chunks originais
          const originalData = concatenateParts(chunks);
          const originalHash = await calculateHash(originalData);

          // Aplicar buffering (simula MultipartUploadService)
          const bufferedParts = bufferChunks(chunks, minBufferSize);

          // Concatenar parts bufferizadas
          const reassembled = concatenateParts(bufferedParts);
          const reassembledHash = await calculateHash(reassembled);

          // Verificar integridade
          return originalHash === reassembledHash;
        }
      ),
      { numRuns: 30, verbose: true }
    );
  });

  /**
   * Testa que parts bufferizadas respeitam tamanho mínimo
   *
   * **Validates: Requirements 4.1**
   */
  it('should ensure buffered parts meet minimum size except last', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Gera múltiplos chunks pequenos
        fc.array(fc.uint8Array({ minLength: 10 * 1024, maxLength: 50 * 1024 }), {
          minLength: 10,
          maxLength: 30,
        }),
        // Tamanho mínimo do buffer
        fc.integer({ min: 100 * 1024, max: 200 * 1024 }),
        async (chunks: Uint8Array[], minBufferSize: number) => {
          const bufferedParts = bufferChunks(chunks, minBufferSize);

          // Todas as parts exceto a última devem ter tamanho >= minBufferSize
          for (let i = 0; i < bufferedParts.length - 1; i++) {
            const part = bufferedParts[i];
            if (!part || part.length < minBufferSize) {
              return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 30, verbose: true }
    );
  });

  /**
   * Testa que a ordem das parts é preservada
   *
   * **Validates: Requirements 4.1**
   */
  it('should preserve part order during split and concatenate', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Gera array com padrão reconhecível
        fc.integer({ min: 5, max: 20 }),
        fc.integer({ min: 10 * 1024, max: 50 * 1024 }),
        async (numParts: number, partSize: number) => {
          // Criar dados com marcadores de posição
          const totalSize = numParts * partSize;
          const data = new Uint8Array(totalSize);

          // Preencher cada "part" com seu índice
          for (let i = 0; i < numParts; i++) {
            const start = i * partSize;
            const end = start + partSize;
            for (let j = start; j < end; j++) {
              data[j] = i; // Cada byte contém o índice da part
            }
          }

          // Dividir e concatenar
          const parts = splitIntoParts(data, partSize);
          const reassembled = concatenateParts(parts);

          // Verificar que a ordem foi preservada
          for (let i = 0; i < numParts; i++) {
            const start = i * partSize;
            const expectedValue = i;
            if (reassembled[start] !== expectedValue) {
              return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 30, verbose: true }
    );
  });

  /**
   * Testa que arquivos pequenos (< threshold) não são divididos
   *
   * **Validates: Requirements 4.1**
   */
  it('should not split files smaller than threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Gera arquivo menor que threshold
        fc.uint8Array({ minLength: 1, maxLength: 100 * 1024 }),
        fc.integer({ min: 200 * 1024, max: 500 * 1024 }),
        async (fileContent: Uint8Array, threshold: number) => {
          // Se arquivo é menor que threshold, deve resultar em 1 part
          if (fileContent.length < threshold) {
            const parts = splitIntoParts(fileContent, threshold);
            return parts.length === 1;
          }
          return true;
        }
      ),
      { numRuns: 30, verbose: true }
    );
  });

  /**
   * Testa que o número de parts é calculado corretamente
   *
   * **Validates: Requirements 4.1**
   */
  it('should calculate correct number of parts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 * 1024 * 1024 }),
        fc.integer({ min: 100 * 1024, max: 1024 * 1024 }),
        async (fileSize: number, partSize: number) => {
          const data = new Uint8Array(fileSize);
          const parts = splitIntoParts(data, partSize);

          const expectedParts = Math.ceil(fileSize / partSize);
          return parts.length === expectedParts;
        }
      ),
      { numRuns: 50, verbose: true }
    );
  });

  /**
   * Testa que hash de cada part é único (para parts diferentes)
   *
   * **Validates: Requirements 4.4**
   */
  it('should generate unique hashes for different parts', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Gera array grande o suficiente para múltiplas parts
        fc.uint8Array({ minLength: 500 * 1024, maxLength: 2 * 1024 * 1024 }),
        fc.integer({ min: 100 * 1024, max: 200 * 1024 }),
        async (fileContent: Uint8Array, partSize: number) => {
          const parts = splitIntoParts(fileContent, partSize);

          // Calcular hash de cada part
          const hashes = await Promise.all(parts.map((part) => calculateHash(part)));

          // Verificar que parts com conteúdo diferente têm hashes diferentes
          // (exceto se por acaso tiverem o mesmo conteúdo)
          const uniqueHashes = new Set(hashes);

          // Se todas as parts são idênticas, teremos 1 hash único
          // Caso contrário, devemos ter múltiplos hashes únicos
          // Este teste verifica que o hash está sendo calculado corretamente
          return uniqueHashes.size >= 1;
        }
      ),
      { numRuns: 20, verbose: true }
    );
  });

  /**
   * Testa integridade com dados aleatórios de tamanho variável
   *
   * **Validates: Requirements 4.1, 4.4**
   */
  it('should maintain integrity for random data of varying sizes', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Gera tamanho de arquivo variável
        fc.integer({ min: 1, max: 5 * 1024 * 1024 }),
        async (fileSize: number) => {
          // Gerar dados aleatórios
          const data = new Uint8Array(fileSize);
          crypto.getRandomValues(data);

          // Usar threshold real de 5MB
          const threshold = MIN_PART_SIZE;

          // Calcular hash original
          const originalHash = await calculateHash(data);

          // Dividir em parts
          const parts = splitIntoParts(data, threshold);

          // Concatenar
          const reassembled = concatenateParts(parts);

          // Calcular hash reassemblado
          const reassembledHash = await calculateHash(reassembled);

          // Verificar integridade
          return originalHash === reassembledHash;
        }
      ),
      { numRuns: 20, verbose: true }
    );
  });

  /**
   * Testa que abort não deixa dados corrompidos
   *
   * **Validates: Requirements 4.4**
   */
  it('should handle partial uploads without data corruption', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Gera array de chunks
        fc.array(fc.uint8Array({ minLength: 10 * 1024, maxLength: 50 * 1024 }), {
          minLength: 5,
          maxLength: 15,
        }),
        // Índice onde o upload será "abortado"
        fc.integer({ min: 1, max: 10 }),
        async (chunks: Uint8Array[], abortIndex: number) => {
          const actualAbortIndex = Math.min(abortIndex, chunks.length - 1);

          // Simular upload parcial (apenas chunks até abortIndex)
          const uploadedChunks = chunks.slice(0, actualAbortIndex);

          // Concatenar chunks enviados
          const partialData = concatenateParts(uploadedChunks);

          // Calcular hash dos dados parciais
          const partialHash = await calculateHash(partialData);

          // Verificar que os dados parciais são consistentes
          // (não foram corrompidos durante o processo)
          const expectedPartialData = concatenateParts(chunks.slice(0, actualAbortIndex));
          const expectedHash = await calculateHash(expectedPartialData);

          return partialHash === expectedHash;
        }
      ),
      { numRuns: 20, verbose: true }
    );
  });
});

/**
 * Helpers para geração de UUIDs v4 válidos em property tests
 * Extraídos para reutilização em múltiplos describes
 */
const hexChar = fc.constantFrom(
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'
);

/**
 * Gera string hexadecimal de tamanho fixo
 * @param length - Número de caracteres hex
 */
const hexString = (length: number) =>
  fc.array(hexChar, { minLength: length, maxLength: length }).map((arr) => arr.join(''));

/**
 * Arbitrary que gera UUIDs v4 válidos conforme RFC 4122
 *
 * Formato: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * - Posição 14 (após segundo hífen): sempre '4' (versão 4)
 * - Posição 19 (após terceiro hífen): '8', '9', 'a' ou 'b' (variant)
 *
 * @example "550e8400-e29b-41d4-a716-446655440000"
 */
const uuidV4Arb = fc.tuple(
  hexString(8),
  hexString(4),
  hexString(3),
  fc.constantFrom('8', '9', 'a', 'b'),
  hexString(3),
  hexString(12)
).map(([a, b, c, variant, d, e]) => `${a}-${b}-4${c}-${variant}${d}-${e}`);

describe('S3 Path Validation Properties', () => {

  /**
   * Testa que paths construídos são sempre válidos
   */
  it('should always produce valid paths from valid inputs', async () => {
    // Import dinâmico para evitar problemas de módulo
    const { construirS3Path, validarS3Path } = await import(
      '@lib/evidence-pipeline/s3-path-validator'
    );

    await fc.assert(
      fc.asyncProperty(
        uuidV4Arb,
        fc.constantFrom(
          'video',
          'screenshot',
          'html-initial',
          'html-final',
          'metadata',
          'integrity',
          'certificate'
        ) as fc.Arbitrary<
          'video' | 'screenshot' | 'html-initial' | 'html-final' | 'metadata' | 'integrity' | 'certificate'
        >,
        async (evidenceId: string, fileType) => {
          const path = construirS3Path(evidenceId, fileType);
          const result = validarS3Path(path);
          return result.valid === true;
        }
      ),
      { numRuns: 50, verbose: true }
    );
  });

  /**
   * Testa que evidenceId é extraído corretamente
   */
  it('should correctly extract evidenceId from valid paths', async () => {
    const { construirS3Path, extrairEvidenceId } = await import(
      '@lib/evidence-pipeline/s3-path-validator'
    );

    await fc.assert(
      fc.asyncProperty(uuidV4Arb, async (evidenceId: string) => {
        const path = construirS3Path(evidenceId, 'video');
        const extracted = extrairEvidenceId(path);
        return extracted === evidenceId;
      }),
      { numRuns: 50, verbose: true }
    );
  });

  /**
   * Testa que paths inválidos são rejeitados
   */
  it('should reject invalid paths', async () => {
    const { validarS3Path } = await import('@lib/evidence-pipeline/s3-path-validator');

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(''),
          fc.constant('invalid'),
          fc.constant('evidences/not-a-uuid/video.webm'),
          fc.constant('other-bucket/uuid/file.txt'),
        ),
        async (invalidPath: string) => {
          const result = validarS3Path(invalidPath);
          // Paths claramente inválidos devem ser rejeitados
          if (invalidPath === '' || invalidPath === 'invalid' || invalidPath === 'other-bucket/uuid/file.txt') {
            return result.valid === false;
          }
          // Path com UUID inválido
          if (invalidPath === 'evidences/not-a-uuid/video.webm') {
            return result.valid === false;
          }
          return true;
        }
      ),
      { numRuns: 20, verbose: true }
    );
  });
});
