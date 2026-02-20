/**
 * Teste de propriedade para detecção de source maps pelo validador
 *
 * **Feature: extensao-mv3-conformidade, Property 1: Validador rejeita source maps em recursos acessíveis**
 * **Validates: Requirements 3.4, 3.5, 10.2**
 *
 * Propriedade: Para qualquer lista de recursos em web_accessible_resources e
 * para qualquer conjunto de arquivos no diretório de saída, se algum recurso
 * ou arquivo tiver extensão .map, o validador SHALL retornar valid: false
 * com erro descritivo e checks.noSourceMaps: false.
 *
 * @module sourcemap-detection.property.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  checkSourceMaps,
  checkMapsInWebAccessibleResources,
  type ManifestValidationResult,
} from '../../scripts/validate-manifest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Cria um ManifestValidationResult limpo para testes individuais.
 * Todos os checks iniciam como true (sem problemas detectados).
 */
function createCleanResult(): ManifestValidationResult {
  return {
    valid: true,
    errors: [],
    warnings: [],
    checks: {
      noUnusedPermissions: true,
      noSourceMaps: true,
      noLocalhostInCSP: true,
      hasMinimumChromeVersion: true,
      noMapsInWebAccessibleResources: true,
    },
  };
}

/**
 * Cria um diretório temporário para testes de filesystem.
 * Cada teste recebe um diretório isolado para evitar interferência.
 */
async function createTempDir(): Promise<string> {
  return await fs.mkdtemp(join(tmpdir(), 'sourcemap-prop-test-'));
}

/**
 * Remove recursivamente um diretório temporário após o teste.
 */
async function removeTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * Cria um arquivo vazio em um caminho relativo dentro do diretório base.
 * Cria subdiretórios intermediários automaticamente.
 */
async function createFile(baseDir: string, relativePath: string): Promise<void> {
  const fullPath = join(baseDir, relativePath);
  const parentDir = join(fullPath, '..');
  await fs.mkdir(parentDir, { recursive: true });
  await fs.writeFile(fullPath, '');
}

// ---------------------------------------------------------------------------
// Arbitrários (Generators) para fast-check
// ---------------------------------------------------------------------------

/**
 * Gerador de nomes de arquivo seguros para o filesystem.
 * Produz nomes alfanuméricos com comprimento entre 1 e 12 caracteres.
 * Evita caracteres especiais que podem causar problemas no filesystem.
 * Usa fc.array de caracteres + join para compatibilidade com fast-check v4.
 */
const arbSafeFileName: fc.Arbitrary<string> = fc
  .array(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
    ),
    { minLength: 1, maxLength: 12 },
  )
  .map((chars) => chars.join(''));

/**
 * Gerador de extensões de arquivo comuns (sem .map).
 * Representa extensões típicas encontradas em builds de extensões Chrome.
 */
const arbNonMapExtension: fc.Arbitrary<string> = fc.constantFrom(
  '.js',
  '.css',
  '.html',
  '.json',
  '.png',
  '.svg',
  '.woff2',
  '.wasm',
);

/**
 * Gerador de caminhos de diretório seguros (0 a 2 níveis de profundidade).
 * Produz prefixos como "", "assets/", "chunks/vendor/" para simular
 * estruturas de diretório reais de builds.
 */
const arbDirPrefix: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  arbSafeFileName.map((name) => `${name}/`),
  fc.tuple(arbSafeFileName, arbSafeFileName).map(
    ([a, b]) => `${a}/${b}/`,
  ),
);

/**
 * Gerador de nomes de arquivo sem extensão .map.
 * Combina prefixo de diretório + nome + extensão não-.map.
 */
const arbNonMapFile: fc.Arbitrary<string> = fc
  .tuple(arbDirPrefix, arbSafeFileName, arbNonMapExtension)
  .map(([dir, name, ext]) => `${dir}${name}${ext}`);

/**
 * Gerador de nomes de arquivo com extensão .map.
 * Combina prefixo de diretório + nome + ".map" ou ".js.map".
 */
const arbMapFile: fc.Arbitrary<string> = fc
  .tuple(
    arbDirPrefix,
    arbSafeFileName,
    fc.constantFrom('.map', '.js.map', '.css.map'),
  )
  .map(([dir, name, ext]) => `${dir}${name}${ext}`);

/**
 * Gerador de padrões de recurso para web_accessible_resources.
 * Inclui padrões com wildcard (ex: "src/assets/*") e caminhos diretos.
 */
const arbNonMapResource: fc.Arbitrary<string> = fc.oneof(
  arbNonMapFile,
  fc.tuple(arbDirPrefix, arbSafeFileName).map(
    ([dir, name]) => `${dir}${name}/*`,
  ),
);

/**
 * Gerador de padrões de recurso que contêm .map.
 * Inclui referências diretas a .map e padrões glob com .map.
 */
const arbMapResource: fc.Arbitrary<string> = fc.oneof(
  arbMapFile,
  fc.tuple(arbDirPrefix).map(([dir]) => `${dir}*.map`),
  fc.tuple(arbDirPrefix, arbSafeFileName).map(
    ([dir, name]) => `${dir}${name}.js.map`,
  ),
);

/**
 * Gerador de entradas de web_accessible_resources do MV3.
 * Cada entrada possui um array de resources e um array de matches.
 */
function arbWarEntry(
  resourceArb: fc.Arbitrary<string[]>,
): fc.Arbitrary<{ resources: string[]; matches: string[] }> {
  return resourceArb.map((resources) => ({
    resources,
    matches: ['<all_urls>'],
  }));
}

// ---------------------------------------------------------------------------
// Testes de propriedade
// ---------------------------------------------------------------------------

describe('Property 1: Validador rejeita source maps em recursos acessíveis', () => {
  // -------------------------------------------------------------------------
  // Parte A: checkMapsInWebAccessibleResources
  // -------------------------------------------------------------------------

  describe('checkMapsInWebAccessibleResources', () => {
    /**
     * Propriedade 1a: Se qualquer recurso em web_accessible_resources contém
     * .map, o validador DEVE retornar noMapsInWebAccessibleResources: false
     * e incluir erro descritivo.
     *
     * Gera listas de recursos onde pelo menos um contém .map, misturado
     * com recursos normais, e verifica que o validador sempre detecta.
     */
    it('detecta .map em qualquer posição da lista de recursos', () => {
      fc.assert(
        fc.property(
          // Lista de recursos normais (0 a 5 itens)
          fc.array(arbNonMapResource, { minLength: 0, maxLength: 5 }),
          // Pelo menos um recurso .map
          arbMapResource,
          // Posição de inserção (será normalizada pelo tamanho do array)
          fc.nat(),
          (normalResources, mapResource, insertPos) => {
            // Inserir o recurso .map em posição aleatória
            const resources = [...normalResources];
            const pos = resources.length === 0
              ? 0
              : insertPos % (resources.length + 1);
            resources.splice(pos, 0, mapResource);

            const manifest: Record<string, unknown> = {
              web_accessible_resources: [
                { resources, matches: ['<all_urls>'] },
              ],
            };

            const result = createCleanResult();
            checkMapsInWebAccessibleResources(manifest, result);

            // Verificações:
            // 1. O check DEVE falhar
            expect(result.checks.noMapsInWebAccessibleResources).toBe(false);

            // 2. DEVE haver pelo menos um erro
            expect(result.errors.length).toBeGreaterThanOrEqual(1);

            // 3. O erro DEVE mencionar .map
            expect(result.errors.some((e) => e.includes('.map'))).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Propriedade 1b: Se nenhum recurso em web_accessible_resources contém
     * .map, o validador DEVE retornar noMapsInWebAccessibleResources: true
     * e nenhum erro relacionado.
     *
     * Gera listas de recursos sem .map e verifica que o validador não
     * produz falsos positivos.
     */
    it('aceita listas de recursos sem .map (sem falsos positivos)', () => {
      fc.assert(
        fc.property(
          // Lista de recursos normais (0 a 10 itens)
          fc.array(arbNonMapResource, { minLength: 0, maxLength: 10 }),
          (resources) => {
            const manifest: Record<string, unknown> = {
              web_accessible_resources: [
                { resources, matches: ['<all_urls>'] },
              ],
            };

            const result = createCleanResult();
            checkMapsInWebAccessibleResources(manifest, result);

            // Verificações:
            // 1. O check DEVE passar
            expect(result.checks.noMapsInWebAccessibleResources).toBe(true);

            // 2. NÃO deve haver erros
            expect(result.errors).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Propriedade 1c: Detecção funciona com múltiplas entradas de
     * web_accessible_resources (formato MV3 permite array de objetos).
     *
     * Gera múltiplas entradas onde pelo menos uma contém .map e verifica
     * que o validador detecta independente da posição da entrada.
     */
    it('detecta .map em qualquer entrada de múltiplas web_accessible_resources', () => {
      fc.assert(
        fc.property(
          // Entradas normais (0 a 3)
          fc.array(
            arbWarEntry(
              fc.array(arbNonMapResource, { minLength: 1, maxLength: 3 }),
            ),
            { minLength: 0, maxLength: 3 },
          ),
          // Entrada com pelo menos um .map
          arbWarEntry(
            fc.tuple(
              fc.array(arbNonMapResource, { minLength: 0, maxLength: 3 }),
              arbMapResource,
            ).map(([normal, mapRes]) => [...normal, mapRes]),
          ),
          // Posição de inserção
          fc.nat(),
          (normalEntries, mapEntry, insertPos) => {
            const entries = [...normalEntries];
            const pos = entries.length === 0
              ? 0
              : insertPos % (entries.length + 1);
            entries.splice(pos, 0, mapEntry);

            const manifest: Record<string, unknown> = {
              web_accessible_resources: entries,
            };

            const result = createCleanResult();
            checkMapsInWebAccessibleResources(manifest, result);

            // O check DEVE falhar
            expect(result.checks.noMapsInWebAccessibleResources).toBe(false);
            expect(result.errors.length).toBeGreaterThanOrEqual(1);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Parte B: checkSourceMaps (verificação de arquivos .map no filesystem)
  // -------------------------------------------------------------------------

  describe('checkSourceMaps', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir();
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    /**
     * Propriedade 1d: Se qualquer arquivo .map existe no diretório de saída,
     * o validador DEVE retornar noSourceMaps: false com erro descritivo.
     *
     * Gera conjuntos de arquivos onde pelo menos um é .map, cria-os no
     * filesystem temporário, e verifica que o validador detecta.
     */
    it('detecta arquivos .map em qualquer posição do diretório de saída', () => {
      return fc.assert(
        fc.asyncProperty(
          // Arquivos normais (0 a 3 para manter testes rápidos)
          fc.array(arbNonMapFile, { minLength: 0, maxLength: 3 }),
          // Pelo menos um arquivo .map (1 a 2)
          fc.array(arbMapFile, { minLength: 1, maxLength: 2 }),
          async (normalFiles, mapFiles) => {
            // Criar diretório isolado para esta iteração
            const iterDir = await createTempDir();

            try {
              // Criar todos os arquivos no diretório temporário
              for (const file of normalFiles) {
                await createFile(iterDir, file);
              }
              for (const file of mapFiles) {
                await createFile(iterDir, file);
              }

              const result = createCleanResult();
              await checkSourceMaps(iterDir, result);

              // Verificações:
              // 1. O check DEVE falhar
              expect(result.checks.noSourceMaps).toBe(false);

              // 2. DEVE haver pelo menos um erro
              expect(result.errors.length).toBeGreaterThanOrEqual(1);

              // 3. O erro DEVE mencionar source maps
              expect(
                result.errors.some((e) =>
                  e.toLowerCase().includes('source map'),
                ),
              ).toBe(true);
            } finally {
              await removeTempDir(iterDir);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Propriedade 1e: Se nenhum arquivo .map existe no diretório de saída,
     * o validador DEVE retornar noSourceMaps: true e nenhum erro.
     *
     * Gera conjuntos de arquivos sem .map e verifica ausência de falsos positivos.
     */
    it('aceita diretórios sem arquivos .map (sem falsos positivos)', () => {
      return fc.assert(
        fc.asyncProperty(
          // Arquivos normais (0 a 5)
          fc.array(arbNonMapFile, { minLength: 0, maxLength: 5 }),
          async (normalFiles) => {
            const iterDir = await createTempDir();

            try {
              for (const file of normalFiles) {
                await createFile(iterDir, file);
              }

              const result = createCleanResult();
              await checkSourceMaps(iterDir, result);

              // Verificações:
              // 1. O check DEVE passar
              expect(result.checks.noSourceMaps).toBe(true);

              // 2. NÃO deve haver erros
              expect(result.errors).toHaveLength(0);
            } finally {
              await removeTempDir(iterDir);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
