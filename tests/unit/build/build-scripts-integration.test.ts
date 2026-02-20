/**
 * Testes unitários para a integração do validador no script de build de produção.
 *
 * Verifica que o package.json contém os scripts corretos para:
 * - Executar a validação do manifest isoladamente (validate)
 * - Executar o build de produção com validação integrada (build:prod)
 * - Garantir que o build falha se a validação falhar (exit code 1)
 *
 * @see Requirements 10.4, 10.5
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Caminho do package.json da extensão Chrome */
const PACKAGE_JSON_PATH = resolve(__dirname, '..', '..', '..', 'package.json');

/** Caminho do script de validação */
const VALIDATE_SCRIPT_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'validate-manifest.ts'
);

/**
 * Lê e faz parse do package.json.
 */
async function readPackageJson(): Promise<Record<string, unknown>> {
  const content = await fs.readFile(PACKAGE_JSON_PATH, 'utf-8');
  return JSON.parse(content) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Testes de estrutura do package.json
// ---------------------------------------------------------------------------

describe('Integração do validador no build de produção', () => {
  describe('Script "validate"', () => {
    it('existe no package.json', async () => {
      const pkg = await readPackageJson();
      const scripts = pkg['scripts'] as Record<string, string>;

      expect(scripts).toHaveProperty('validate');
    });

    it('executa o script validate-manifest.ts com tsx', async () => {
      const pkg = await readPackageJson();
      const scripts = pkg['scripts'] as Record<string, string>;

      expect(scripts['validate']).toContain('tsx');
      expect(scripts['validate']).toContain('validate-manifest.ts');
    });

    it('aponta para o diretório de saída ./dist', async () => {
      const pkg = await readPackageJson();
      const scripts = pkg['scripts'] as Record<string, string>;

      expect(scripts['validate']).toContain('./dist');
    });
  });

  describe('Script "build:prod"', () => {
    it('existe no package.json', async () => {
      const pkg = await readPackageJson();
      const scripts = pkg['scripts'] as Record<string, string>;

      expect(scripts).toHaveProperty('build:prod');
    });

    it('executa o build com modo production', async () => {
      const pkg = await readPackageJson();
      const scripts = pkg['scripts'] as Record<string, string>;

      expect(scripts['build:prod']).toContain('--mode production');
    });

    it('inclui typecheck via tsc antes do build', async () => {
      const pkg = await readPackageJson();
      const scripts = pkg['scripts'] as Record<string, string>;

      expect(scripts['build:prod']).toContain('tsc -p tsconfig.build.json');
    });

    it('inclui vite build', async () => {
      const pkg = await readPackageJson();
      const scripts = pkg['scripts'] as Record<string, string>;

      expect(scripts['build:prod']).toContain('vite build');
    });

    it('chama o validador após o build', async () => {
      const pkg = await readPackageJson();
      const scripts = pkg['scripts'] as Record<string, string>;
      const buildProd = scripts['build:prod'];

      // O validador deve ser chamado APÓS o vite build
      const viteBuildIndex = buildProd.indexOf('vite build');
      const validateIndex = buildProd.indexOf('validate');

      expect(viteBuildIndex).toBeGreaterThan(-1);
      expect(validateIndex).toBeGreaterThan(viteBuildIndex);
    });

    it('usa encadeamento com && para garantir que falha propaga exit code', async () => {
      const pkg = await readPackageJson();
      const scripts = pkg['scripts'] as Record<string, string>;

      // O operador && garante que se qualquer comando falhar,
      // o script inteiro falha com exit code diferente de 0
      expect(scripts['build:prod']).toContain('&&');

      // Verifica que o validate está encadeado com &&
      const parts = scripts['build:prod'].split('&&').map((p) => p.trim());
      const lastPart = parts[parts.length - 1];
      expect(lastPart).toContain('validate');
    });
  });

  describe('Script "build" original', () => {
    it('permanece inalterado (sem validação)', async () => {
      const pkg = await readPackageJson();
      const scripts = pkg['scripts'] as Record<string, string>;

      // O script build original não deve incluir validação
      expect(scripts['build']).toBe(
        'tsc -p tsconfig.build.json && vite build'
      );
      expect(scripts['build']).not.toContain('validate');
    });
  });

  describe('Arquivo do script de validação', () => {
    it('existe no caminho esperado (scripts/validate-manifest.ts)', async () => {
      const stat = await fs.stat(VALIDATE_SCRIPT_PATH);
      expect(stat.isFile()).toBe(true);
    });
  });
});
