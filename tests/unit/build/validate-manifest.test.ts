/**
 * Testes unitários para o validador automatizado de manifest.
 *
 * Verifica o comportamento de cada verificação individual e da
 * função principal validateManifest contra cenários reais e edge cases.
 *
 * @see Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateManifest,
  readManifest,
  findSourceFiles,
  readAllSourceContent,
  checkSourceMaps,
  checkLocalhostInCSP,
  checkMinimumChromeVersion,
  checkMapsInWebAccessibleResources,
  checkUnusedPermissions,
  PERMISSION_API_PATTERNS,
  IMPLICIT_PERMISSIONS,
  type ManifestValidationResult,
} from '../../../scripts/validate-manifest';

// ---------------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------------

/** Cria um diretório temporário para testes */
async function createTempDir(): Promise<string> {
  return await fs.mkdtemp(join(tmpdir(), 'validate-manifest-test-'));
}

/** Remove recursivamente um diretório temporário */
async function removeTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/** Cria um arquivo com conteúdo no diretório especificado */
async function createFile(
  dir: string,
  name: string,
  content = ''
): Promise<string> {
  const filePath = join(dir, name);
  const fileDir = join(filePath, '..');
  await fs.mkdir(fileDir, { recursive: true });
  await fs.writeFile(filePath, content);
  return filePath;
}

/** Cria um ManifestValidationResult limpo para testes individuais */
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

/** Manifest válido mínimo para testes */
function createValidManifest(): Record<string, unknown> {
  return {
    manifest_version: 3,
    name: 'Test Extension',
    version: '1.0.0',
    minimum_chrome_version: '116',
    permissions: ['storage', 'tabs'],
    optional_permissions: ['notifications'],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' https://*.lexato.com.br",
    },
    web_accessible_resources: [
      {
        resources: ['src/assets/*', 'src/overlay/*'],
        matches: ['<all_urls>'],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// readManifest
// ---------------------------------------------------------------------------

describe('readManifest', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it('retorna objeto do manifest quando arquivo existe e é JSON válido', async () => {
    await createFile(
      tempDir,
      'manifest.json',
      JSON.stringify({ manifest_version: 3, name: 'Test' })
    );
    const result = await readManifest(tempDir);
    expect(result).toEqual({ manifest_version: 3, name: 'Test' });
  });

  it('retorna null quando manifest.json não existe', async () => {
    const result = await readManifest(tempDir);
    expect(result).toBeNull();
  });

  it('retorna null quando manifest.json contém JSON inválido', async () => {
    await createFile(tempDir, 'manifest.json', '{ invalid json }');
    const result = await readManifest(tempDir);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findSourceFiles
// ---------------------------------------------------------------------------

describe('findSourceFiles', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it('encontra arquivos .ts e .tsx', async () => {
    await createFile(tempDir, 'app.ts', 'code');
    await createFile(tempDir, 'component.tsx', 'code');
    await createFile(tempDir, 'style.css', 'body {}');

    const files = await findSourceFiles(tempDir);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.endsWith('.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('.tsx'))).toBe(true);
  });

  it('busca recursivamente em subdiretórios', async () => {
    await createFile(tempDir, 'lib/utils.ts', 'code');
    await createFile(tempDir, 'lib/deep/nested.ts', 'code');

    const files = await findSourceFiles(tempDir);
    expect(files).toHaveLength(2);
  });

  it('ignora diretórios node_modules e dist', async () => {
    await createFile(tempDir, 'app.ts', 'code');
    await createFile(tempDir, 'node_modules/pkg/index.ts', 'code');
    await createFile(tempDir, 'dist/bundle.ts', 'code');

    const files = await findSourceFiles(tempDir);
    expect(files).toHaveLength(1);
  });

  it('retorna array vazio para diretório inexistente', async () => {
    const files = await findSourceFiles(join(tempDir, 'inexistente'));
    expect(files).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// readAllSourceContent
// ---------------------------------------------------------------------------

describe('readAllSourceContent', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it('concatena conteúdo de todos os arquivos .ts/.tsx', async () => {
    await createFile(tempDir, 'a.ts', 'chrome.storage.get()');
    await createFile(tempDir, 'b.tsx', 'chrome.tabs.query()');

    const content = await readAllSourceContent(tempDir);
    expect(content).toContain('chrome.storage.get()');
    expect(content).toContain('chrome.tabs.query()');
  });

  it('retorna string vazia para diretório sem arquivos fonte', async () => {
    await createFile(tempDir, 'readme.md', 'docs');
    const content = await readAllSourceContent(tempDir);
    expect(content).toBe('');
  });
});

// ---------------------------------------------------------------------------
// checkSourceMaps
// ---------------------------------------------------------------------------

describe('checkSourceMaps', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it('passa quando não há arquivos .map', async () => {
    await createFile(tempDir, 'app.js', 'code');
    const result = createCleanResult();

    await checkSourceMaps(tempDir, result);
    expect(result.checks.noSourceMaps).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('falha quando há arquivos .map no diretório', async () => {
    await createFile(tempDir, 'app.js.map', '{}');
    await createFile(tempDir, 'assets/vendor.js.map', '{}');
    const result = createCleanResult();

    await checkSourceMaps(tempDir, result);
    expect(result.checks.noSourceMaps).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Source maps encontrados');
    expect(result.errors[0]).toContain('2 arquivo(s)');
  });
});

// ---------------------------------------------------------------------------
// checkLocalhostInCSP
// ---------------------------------------------------------------------------

describe('checkLocalhostInCSP', () => {
  it('passa quando CSP não contém localhost', () => {
    const manifest = createValidManifest();
    const result = createCleanResult();

    checkLocalhostInCSP(manifest, result);
    expect(result.checks.noLocalhostInCSP).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('falha quando CSP contém http://localhost', () => {
    const manifest = createValidManifest();
    (manifest['content_security_policy'] as Record<string, string>)[
      'extension_pages'
    ] = "script-src 'self'; connect-src 'self' http://localhost:3000";
    const result = createCleanResult();

    checkLocalhostInCSP(manifest, result);
    expect(result.checks.noLocalhostInCSP).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('falha quando CSP contém ws://localhost', () => {
    const manifest = createValidManifest();
    (manifest['content_security_policy'] as Record<string, string>)[
      'extension_pages'
    ] = "script-src 'self'; connect-src 'self' ws://localhost:5173";
    const result = createCleanResult();

    checkLocalhostInCSP(manifest, result);
    expect(result.checks.noLocalhostInCSP).toBe(false);
  });

  it('falha quando CSP contém http://127.0.0.1', () => {
    const manifest = createValidManifest();
    (manifest['content_security_policy'] as Record<string, string>)[
      'extension_pages'
    ] = "script-src 'self'; connect-src 'self' http://127.0.0.1:8080";
    const result = createCleanResult();

    checkLocalhostInCSP(manifest, result);
    expect(result.checks.noLocalhostInCSP).toBe(false);
  });

  it('falha quando CSP contém ws://127.0.0.1', () => {
    const manifest = createValidManifest();
    (manifest['content_security_policy'] as Record<string, string>)[
      'extension_pages'
    ] = "script-src 'self'; connect-src 'self' ws://127.0.0.1:5173";
    const result = createCleanResult();

    checkLocalhostInCSP(manifest, result);
    expect(result.checks.noLocalhostInCSP).toBe(false);
  });

  it('detecta múltiplos padrões de localhost no mesmo CSP', () => {
    const manifest = createValidManifest();
    (manifest['content_security_policy'] as Record<string, string>)[
      'extension_pages'
    ] =
      "script-src 'self'; connect-src 'self' http://localhost:3000 ws://localhost:5173 http://127.0.0.1:8080 ws://127.0.0.1:5173";
    const result = createCleanResult();

    checkLocalhostInCSP(manifest, result);
    expect(result.checks.noLocalhostInCSP).toBe(false);
    expect(result.errors).toHaveLength(4);
  });

  it('não falha quando manifest não tem CSP definido', () => {
    const manifest: Record<string, unknown> = { manifest_version: 3 };
    const result = createCleanResult();

    checkLocalhostInCSP(manifest, result);
    expect(result.checks.noLocalhostInCSP).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkMinimumChromeVersion
// ---------------------------------------------------------------------------

describe('checkMinimumChromeVersion', () => {
  it('passa quando minimum_chrome_version está presente', () => {
    const manifest = createValidManifest();
    const result = createCleanResult();

    checkMinimumChromeVersion(manifest, result);
    expect(result.checks.hasMinimumChromeVersion).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('falha quando minimum_chrome_version está ausente', () => {
    const manifest = createValidManifest();
    delete manifest['minimum_chrome_version'];
    const result = createCleanResult();

    checkMinimumChromeVersion(manifest, result);
    expect(result.checks.hasMinimumChromeVersion).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('minimum_chrome_version');
  });

  it('falha quando minimum_chrome_version é string vazia', () => {
    const manifest = createValidManifest();
    manifest['minimum_chrome_version'] = '';
    const result = createCleanResult();

    checkMinimumChromeVersion(manifest, result);
    expect(result.checks.hasMinimumChromeVersion).toBe(false);
  });

  it('falha quando minimum_chrome_version é string com apenas espaços', () => {
    const manifest = createValidManifest();
    manifest['minimum_chrome_version'] = '   ';
    const result = createCleanResult();

    checkMinimumChromeVersion(manifest, result);
    expect(result.checks.hasMinimumChromeVersion).toBe(false);
  });

  it('falha quando minimum_chrome_version não é string', () => {
    const manifest = createValidManifest();
    manifest['minimum_chrome_version'] = 116;
    const result = createCleanResult();

    checkMinimumChromeVersion(manifest, result);
    expect(result.checks.hasMinimumChromeVersion).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkMapsInWebAccessibleResources
// ---------------------------------------------------------------------------

describe('checkMapsInWebAccessibleResources', () => {
  it('passa quando web_accessible_resources não contém .map', () => {
    const manifest = createValidManifest();
    const result = createCleanResult();

    checkMapsInWebAccessibleResources(manifest, result);
    expect(result.checks.noMapsInWebAccessibleResources).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('falha quando web_accessible_resources contém referência a .map', () => {
    const manifest = createValidManifest();
    manifest['web_accessible_resources'] = [
      {
        resources: ['src/assets/*', 'src/js/*.map'],
        matches: ['<all_urls>'],
      },
    ];
    const result = createCleanResult();

    checkMapsInWebAccessibleResources(manifest, result);
    expect(result.checks.noMapsInWebAccessibleResources).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('.map');
  });

  it('detecta .map em múltiplas entradas de web_accessible_resources', () => {
    const manifest = createValidManifest();
    manifest['web_accessible_resources'] = [
      { resources: ['dist/*.map'], matches: ['<all_urls>'] },
      { resources: ['chunks/vendor.js.map'], matches: ['<all_urls>'] },
    ];
    const result = createCleanResult();

    checkMapsInWebAccessibleResources(manifest, result);
    expect(result.checks.noMapsInWebAccessibleResources).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it('não falha quando manifest não tem web_accessible_resources', () => {
    const manifest: Record<string, unknown> = { manifest_version: 3 };
    const result = createCleanResult();

    checkMapsInWebAccessibleResources(manifest, result);
    expect(result.checks.noMapsInWebAccessibleResources).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkUnusedPermissions
// ---------------------------------------------------------------------------

describe('checkUnusedPermissions', () => {
  it('passa quando todas as permissões obrigatórias têm uso correspondente', () => {
    const manifest = createValidManifest();
    manifest['permissions'] = ['storage', 'tabs'];
    manifest['optional_permissions'] = [];
    const sourceContent = `
      chrome.storage.local.get('key');
      chrome.tabs.query({ active: true });
    `;
    const result = createCleanResult();

    checkUnusedPermissions(manifest, sourceContent, result);
    expect(result.checks.noUnusedPermissions).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('falha quando permissão obrigatória não tem uso no código', () => {
    const manifest = createValidManifest();
    manifest['permissions'] = ['storage', 'tabs', 'cookies'];
    manifest['optional_permissions'] = [];
    const sourceContent = `
      chrome.storage.local.get('key');
      chrome.tabs.query({ active: true });
    `;
    const result = createCleanResult();

    checkUnusedPermissions(manifest, sourceContent, result);
    expect(result.checks.noUnusedPermissions).toBe(false);
    expect(result.errors.some((e) => e.includes('cookies'))).toBe(true);
  });

  it('emite warning para permissão activeTab (implícita, sem API direta)', () => {
    const manifest = createValidManifest();
    manifest['permissions'] = ['activeTab'];
    manifest['optional_permissions'] = [];
    const sourceContent = '';
    const result = createCleanResult();

    checkUnusedPermissions(manifest, sourceContent, result);
    expect(result.checks.noUnusedPermissions).toBe(true);
    expect(result.warnings.some((w) => w.includes('activeTab'))).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('emite warning para permissão não mapeada na tabela', () => {
    const manifest = createValidManifest();
    manifest['permissions'] = ['unknownPermission'];
    manifest['optional_permissions'] = [];
    const sourceContent = '';
    const result = createCleanResult();

    checkUnusedPermissions(manifest, sourceContent, result);
    expect(result.checks.noUnusedPermissions).toBe(true);
    expect(
      result.warnings.some((w) => w.includes('unknownPermission'))
    ).toBe(true);
  });

  it('passa para permissões opcionais quando chrome.permissions.request existe no código', () => {
    const manifest = createValidManifest();
    manifest['permissions'] = [];
    manifest['optional_permissions'] = ['notifications', 'management'];
    const sourceContent = `
      const granted = await chrome.permissions.request({ permissions: ['notifications'] });
    `;
    const result = createCleanResult();

    checkUnusedPermissions(manifest, sourceContent, result);
    expect(result.checks.noUnusedPermissions).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('falha para permissões opcionais quando chrome.permissions.request NÃO existe no código', () => {
    const manifest = createValidManifest();
    manifest['permissions'] = [];
    manifest['optional_permissions'] = ['notifications'];
    const sourceContent = `
      chrome.notifications.create('id', { title: 'Test' });
    `;
    const result = createCleanResult();

    checkUnusedPermissions(manifest, sourceContent, result);
    expect(result.checks.noUnusedPermissions).toBe(false);
    expect(
      result.errors.some((e) => e.includes('chrome.permissions.request'))
    ).toBe(true);
  });

  it('detecta uso de geolocation via offscreen document com GEOLOCATION', () => {
    const manifest = createValidManifest();
    manifest['permissions'] = ['geolocation'];
    manifest['optional_permissions'] = [];
    const sourceContent = `
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.GEOLOCATION],
        justification: 'Coleta de metadados de localização'
      });
    `;
    const result = createCleanResult();

    checkUnusedPermissions(manifest, sourceContent, result);
    expect(result.checks.noUnusedPermissions).toBe(true);
  });

  it('detecta uso de geolocation via navigator.geolocation', () => {
    const manifest = createValidManifest();
    manifest['permissions'] = ['geolocation'];
    manifest['optional_permissions'] = [];
    const sourceContent = `
      navigator.geolocation.getCurrentPosition(callback);
    `;
    const result = createCleanResult();

    checkUnusedPermissions(manifest, sourceContent, result);
    expect(result.checks.noUnusedPermissions).toBe(true);
  });

  it('detecta múltiplas permissões não utilizadas', () => {
    const manifest = createValidManifest();
    manifest['permissions'] = ['cookies', 'webRequest', 'storage'];
    manifest['optional_permissions'] = [];
    const sourceContent = 'chrome.storage.local.get("key");';
    const result = createCleanResult();

    checkUnusedPermissions(manifest, sourceContent, result);
    expect(result.checks.noUnusedPermissions).toBe(false);
    expect(result.errors.some((e) => e.includes('cookies'))).toBe(true);
    expect(result.errors.some((e) => e.includes('webRequest'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateManifest (integração)
// ---------------------------------------------------------------------------

describe('validateManifest', () => {
  let tempDir: string;
  let srcDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    srcDir = join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it('retorna valid=true para manifest e código-fonte conformes', async () => {
    // Criar manifest válido
    const manifest = createValidManifest();
    manifest['permissions'] = ['storage', 'tabs'];
    manifest['optional_permissions'] = ['notifications'];
    await createFile(tempDir, 'manifest.json', JSON.stringify(manifest));

    // Criar código-fonte com uso das APIs
    await createFile(
      srcDir,
      'background.ts',
      `
      chrome.storage.local.get('key');
      chrome.tabs.query({ active: true });
      chrome.permissions.request({ permissions: ['notifications'] });
    `
    );

    const result = await validateManifest(tempDir, { srcDir });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.checks.noSourceMaps).toBe(true);
    expect(result.checks.noLocalhostInCSP).toBe(true);
    expect(result.checks.hasMinimumChromeVersion).toBe(true);
    expect(result.checks.noMapsInWebAccessibleResources).toBe(true);
    expect(result.checks.noUnusedPermissions).toBe(true);
  });

  it('retorna valid=false quando manifest.json não existe', async () => {
    const result = await validateManifest(tempDir, { srcDir });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Manifest não encontrado');
  });

  it('retorna valid=false quando há source maps no diretório', async () => {
    const manifest = createValidManifest();
    manifest['permissions'] = [];
    manifest['optional_permissions'] = [];
    await createFile(tempDir, 'manifest.json', JSON.stringify(manifest));
    await createFile(tempDir, 'app.js.map', '{}');

    const result = await validateManifest(tempDir, { srcDir });
    expect(result.valid).toBe(false);
    expect(result.checks.noSourceMaps).toBe(false);
  });

  it('retorna valid=false quando CSP contém localhost', async () => {
    const manifest = createValidManifest();
    manifest['permissions'] = [];
    manifest['optional_permissions'] = [];
    (manifest['content_security_policy'] as Record<string, string>)[
      'extension_pages'
    ] = "script-src 'self'; connect-src 'self' http://localhost:3000";
    await createFile(tempDir, 'manifest.json', JSON.stringify(manifest));

    const result = await validateManifest(tempDir, { srcDir });
    expect(result.valid).toBe(false);
    expect(result.checks.noLocalhostInCSP).toBe(false);
  });

  it('retorna valid=false quando minimum_chrome_version está ausente', async () => {
    const manifest = createValidManifest();
    delete manifest['minimum_chrome_version'];
    manifest['permissions'] = [];
    manifest['optional_permissions'] = [];
    await createFile(tempDir, 'manifest.json', JSON.stringify(manifest));

    const result = await validateManifest(tempDir, { srcDir });
    expect(result.valid).toBe(false);
    expect(result.checks.hasMinimumChromeVersion).toBe(false);
  });

  it('acumula múltiplos erros de diferentes verificações', async () => {
    const manifest = createValidManifest();
    delete manifest['minimum_chrome_version'];
    manifest['permissions'] = ['cookies'];
    manifest['optional_permissions'] = [];
    (manifest['content_security_policy'] as Record<string, string>)[
      'extension_pages'
    ] = "script-src 'self'; connect-src 'self' http://localhost:3000";
    manifest['web_accessible_resources'] = [
      { resources: ['dist/*.map'], matches: ['<all_urls>'] },
    ];
    await createFile(tempDir, 'manifest.json', JSON.stringify(manifest));
    await createFile(tempDir, 'app.js.map', '{}');

    const result = await validateManifest(tempDir, { srcDir });
    expect(result.valid).toBe(false);
    // Deve ter erros de: source maps, localhost, minimum_chrome_version, .map em WAR, cookies não utilizado
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
    expect(result.checks.noSourceMaps).toBe(false);
    expect(result.checks.noLocalhostInCSP).toBe(false);
    expect(result.checks.hasMinimumChromeVersion).toBe(false);
    expect(result.checks.noMapsInWebAccessibleResources).toBe(false);
    expect(result.checks.noUnusedPermissions).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Constantes exportadas
// ---------------------------------------------------------------------------

describe('Constantes exportadas', () => {
  it('PERMISSION_API_PATTERNS contém todas as permissões esperadas', () => {
    const expectedPermissions = [
      'cookies',
      'webRequest',
      'management',
      'geolocation',
      'notifications',
      'tabCapture',
      'storage',
      'tabs',
      'scripting',
      'alarms',
      'webNavigation',
      'offscreen',
      'sidePanel',
      'identity',
    ];

    for (const perm of expectedPermissions) {
      expect(PERMISSION_API_PATTERNS).toHaveProperty(perm);
      expect(PERMISSION_API_PATTERNS[perm]?.length).toBeGreaterThan(0);
    }
  });

  it('IMPLICIT_PERMISSIONS contém activeTab', () => {
    expect(IMPLICIT_PERMISSIONS.has('activeTab')).toBe(true);
  });

  it('cada padrão de API é uma RegExp válida', () => {
    for (const [_perm, patterns] of Object.entries(PERMISSION_API_PATTERNS)) {
      for (const pattern of patterns) {
        expect(pattern).toBeInstanceOf(RegExp);
        // Verifica que o padrão não lança erro ao ser testado
        expect(() => pattern.test('test string')).not.toThrow();
      }
    }
  });
});
