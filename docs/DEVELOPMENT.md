# Documentação de Desenvolvimento

Este documento descreve os processos core da extensão Chrome do Lexato: PISA, Lockdown e PCC.

## Índice

- [Visão Geral](#visão-geral)
- [PISA - Processo de Inicialização Segura](#pisa---processo-de-inicialização-segura)
- [Modo Lockdown](#modo-lockdown)
- [PCC - Certificação em Cascata](#pcc---certificação-em-cascata)
- [Fluxo de Captura](#fluxo-de-captura)
- [Utilitários Criptográficos](#utilitários-criptográficos)
- [Resiliência e Circuit Breaker](#resiliência-e-circuit-breaker)
- [Auditoria e Logs](#auditoria-e-logs)

## Visão Geral

A extensão Chrome do Lexato implementa três processos core para garantir a integridade e validade jurídica das provas digitais:

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE CAPTURA                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐    ┌──────────┐    ┌─────────┐    ┌─────────────┐ │
│  │  PISA   │───▶│ LOCKDOWN │───▶│ CAPTURA │───▶│ PCC (1-2)   │ │
│  │ (H0-H4) │    │ (Ativo)  │    │ (Dados) │    │ (Local)     │ │
│  └─────────┘    └──────────┘    └─────────┘    └─────────────┘ │
│                                                      │          │
│                                                      ▼          │
│                                              ┌─────────────┐    │
│                                              │   UPLOAD    │    │
│                                              │   (S3)      │    │
│                                              └─────────────┘    │
│                                                      │          │
│                                                      ▼          │
│                                              ┌─────────────┐    │
│                                              │ PCC (3-5)   │    │
│                                              │ (Backend)   │    │
│                                              └─────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## PISA - Processo de Inicialização Segura

### Objetivo

Criar uma cadeia de hashes que documenta cada etapa da inicialização, garantindo:
- Rastreabilidade completa do processo
- Eliminação de manipulações prévias na página
- Prova de que o ambiente foi inicializado corretamente

### Etapas do PISA

```
┌────────────────────────────────────────────────────────────────┐
│                    CADEIA DE HASHES PISA                       │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  H0 (PRE_RELOAD)                                               │
│  ├── URL atual                                                 │
│  ├── Timestamp do clique                                       │
│  ├── User-Agent                                                │
│  └── Versão da extensão                                        │
│       │                                                        │
│       ▼                                                        │
│  H1 (POST_RELOAD) = Hash(H0 + dados_reload)                    │
│  ├── Reload com cache-busting (_lexato_nocache)                │
│  └── Aguarda load event                                        │
│       │                                                        │
│       ▼                                                        │
│  H2 (LOADED) = Hash(H1 + dados_loaded)                         │
│  ├── document.readyState === 'complete'                        │
│  ├── Todas as imagens carregadas                               │
│  └── Fontes carregadas (document.fonts.ready)                  │
│       │                                                        │
│       ▼                                                        │
│  H3 (SECURE_CHANNEL) = Hash(H2 + dados_canal)                  │
│  ├── Par de chaves ECDH P-256                                  │
│  ├── Nonce anti-replay (128 bits)                              │
│  └── Troca com servidor                                        │
│       │                                                        │
│       ▼                                                        │
│  H4 (LOCKDOWN) = Hash(H3 + dados_lockdown)                     │
│  ├── Proteções ativadas                                        │
│  └── Baseline snapshot do DOM                                  │
│       │                                                        │
│       ▼                                                        │
│  HASH_CADEIA = Hash(H0 || H1 || H2 || H3 || H4)                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Implementação

```typescript
// src/lib/pisa-process.ts

import { CryptoUtils } from './crypto-utils';
import { AuditLogger } from './audit-logger';

export class PISAProcess {
  private logger: AuditLogger;
  private stages: ResultadoEtapaPISA[] = [];
  
  async execute(url: string, tabId: number): Promise<PISAResult> {
    // Etapa 0: Hash pré-reload
    const h0 = await this.stage0_preReload(url);
    
    // Etapa 1: Reload forçado
    const h1 = await this.stage1_forceReload(tabId, h0.hash);
    
    // Etapa 2: Verificação de carregamento
    const h2 = await this.stage2_verifyLoaded(tabId, h1.hash);
    
    // Etapa 3: Canal seguro
    const h3 = await this.stage3_secureChannel(h2.hash);
    
    // Etapa 4: Lockdown
    const h4 = await this.stage4_activateLockdown(tabId, h3.hash);
    
    // Calcular HASH_CADEIA
    const hashCadeia = await this.calculateChainHash();
    
    return { success: true, hashCadeia, stages: this.stages };
  }
}
```

### Timeouts

| Etapa | Timeout | Descrição |
|-------|---------|-----------|
| PAGE_LOAD | 30s | Carregamento completo da página |
| SECURE_CHANNEL | 30s | Estabelecimento do canal seguro |
| LOCKDOWN | 5s | Ativação das proteções |

### Tratamento de Erros

Se qualquer etapa falhar:
1. O processo é abortado imediatamente
2. Erro detalhado é registrado no AuditLogger
3. Usuário recebe mensagem explicativa
4. Nenhuma captura é realizada

## Modo Lockdown

### Objetivo

Bloquear todas as interações que possam manipular a página durante a captura, garantindo a integridade da evidência.

### Proteções Implementadas

```
┌────────────────────────────────────────────────────────────────┐
│                    PROTEÇÕES LOCKDOWN                          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  EVENTOS BLOQUEADOS (useCapture: true)                         │
│  ├── keydown, keyup, keypress (exceto Escape)                  │
│  ├── contextmenu (menu de contexto)                            │
│  ├── selectstart (seleção de texto)                            │
│  ├── dragstart (drag & drop)                                   │
│  ├── copy, paste, cut                                          │
│  └── beforeprint, afterprint                                   │
│                                                                │
│  ATALHOS BLOQUEADOS                                            │
│  ├── F12 (DevTools)                                            │
│  ├── Ctrl+Shift+I/J/C (DevTools)                               │
│  ├── Ctrl+U (View Source)                                      │
│  ├── Ctrl+P (Print)                                            │
│  └── Ctrl+S (Save)                                             │
│                                                                │
│  ELEMENTOS BLOQUEADOS                                          │
│  ├── iframe                                                    │
│  ├── frame                                                     │
│  ├── object                                                    │
│  ├── embed                                                     │
│  └── script                                                    │
│                                                                │
│  MONITORAMENTO                                                 │
│  ├── MutationObserver (DOM)                                    │
│  ├── Shadow DOM (recursivo)                                    │
│  ├── DevTools (outerWidth - innerWidth > 160px)                │
│  └── Verificação contínua (500ms)                              │
│                                                                │
│  PROTEÇÃO DE FUNÇÕES                                           │
│  ├── Object.freeze(EventTarget.prototype)                      │
│  ├── Object.freeze(Document.prototype)                         │
│  └── Object.freeze(Element.prototype)                          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Implementação

```typescript
// src/content/lockdown-manager.ts

export class LockdownSecurityManager {
  private isActive = false;
  private violations: ViolacaoLockdown[] = [];
  
  activate(): LockdownActivationResult {
    // 1. Proteger funções nativas PRIMEIRO
    this.protectNativeFunctions();
    
    // 2. Verificar DevTools
    if (this.isDevToolsOpen()) {
      throw new Error('DevTools detectado');
    }
    
    // 3. Bloquear eventos
    this.blockEvents();
    
    // 4. Iniciar MutationObserver
    this.startDOMMonitoring();
    
    // 5. Bloquear elementos perigosos
    this.blockDangerousElements();
    
    // 6. Bloquear bookmarklets
    this.blockBookmarklets();
    
    // 7. Monitoramento contínuo
    this.startContinuousMonitoring();
    
    this.isActive = true;
    return { success: true, protections: this.protections };
  }
}
```

### Detecção de DevTools

```typescript
private isDevToolsOpen(): boolean {
  const threshold = 160; // pixels
  const widthDiff = window.outerWidth - window.innerWidth;
  const heightDiff = window.outerHeight - window.innerHeight;
  return widthDiff > threshold || heightDiff > threshold;
}
```

### Registro de Violações

Todas as violações são registradas com:
- Tipo da violação
- Timestamp
- Detalhes específicos

```typescript
interface ViolacaoLockdown {
  type: string;
  timestamp: number;
  details: Record<string, unknown>;
}
```

## PCC - Certificação em Cascata

### Objetivo

Aplicar múltiplas camadas de certificação para garantir validade jurídica da evidência.

### Níveis de Certificação

```
┌────────────────────────────────────────────────────────────────┐
│                    NÍVEIS PCC                                  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  NÍVEL 1 - Certificação Local (Extensão)                       │
│  ├── Merkle Tree dos componentes                               │
│  ├── Hash_N1 = Hash(HASH_CADEIA || dados_locais)               │
│  └── NULL_HASH = hashSync('LEXATO_MERKLE_NULL_LEAF')           │
│       │                                                        │
│       ▼                                                        │
│  NÍVEL 2 - Certificação do Servidor (Extensão + Backend)       │
│  ├── Enviar Hash_N1 para servidor                              │
│  ├── Receber timestamp e assinatura                            │
│  ├── Verificar assinatura                                      │
│  └── Hash_N2 = Hash(Hash_N1 || cert_servidor)                  │
│       │                                                        │
│       ▼                                                        │
│  NÍVEL 3 - ICP-Brasil (Backend)                                │
│  ├── TSA (Time Stamp Authority)                                │
│  ├── Fallback: BRy Tecnologia                                  │
│  └── Timeout: 5 minutos                                        │
│       │                                                        │
│       ▼                                                        │
│  NÍVEL 4 - Blockchain (Backend)                                │
│  ├── Polygon (primário) - SEMPRE PRIMEIRO                      │
│  ├── Arbitrum One (secundário)                                 │
│  └── Timeout: 10 minutos                                       │
│       │                                                        │
│       ▼                                                        │
│  NÍVEL 5 - PDF (Backend)                                       │
│  └── Geração do documento final                                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Merkle Tree

```typescript
// src/lib/merkle-tree.ts

export class MerkleTree {
  private leaves: string[] = [];
  private root: string = '';
  
  // NULL_HASH para padding
  static readonly NULL_HASH = hashSync('LEXATO_MERKLE_NULL_LEAF');
  
  addLeaf(data: string): void {
    const hash = hashSync(data);
    this.leaves.push(hash);
  }
  
  build(): string {
    // Ordenar hashes (left < right)
    // Construir árvore bottom-up
    // Retornar root hash
  }
}
```

### Ordem de Blockchain

**CRÍTICO**: Sempre Polygon primeiro, depois Arbitrum, e por fim Optimism (Merkle root).

```typescript
interface ResultadoTriploRegistro {
  primario: ResultadoBlockchain;    // Polygon
  secundario: ResultadoBlockchain;  // Arbitrum
  terciario: ResultadoBlockchain;   // Optimism (Merkle root dos txHashes)
  estrategia: 'polygon+arbitrum+optimism';
}
```

## Fluxo de Captura

### Screenshot (Full-Page)

```
┌────────────────────────────────────────────────────────────────┐
│                    FLUXO SCREENSHOT                            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  1. Usuário clica em "Capturar Screenshot"                     │
│       │                                                        │
│       ▼                                                        │
│  2. PISA - Inicialização Segura                                │
│     ├── H0 → H1 → H2 → H3 → H4                                 │
│     └── HASH_CADEIA calculado                                  │
│       │                                                        │
│       ▼                                                        │
│  3. Lockdown Ativado                                           │
│       │                                                        │
│       ▼                                                        │
│  4. Captura por Stitching                                      │
│     ├── Scroll automático                                      │
│     ├── Captura de viewports (timeout 10s cada)                │
│     └── Costura em imagem única                                │
│       │                                                        │
│       ▼                                                        │
│  5. Coleta de Dados                                            │
│     ├── Screenshot (WebP 90%)                                  │
│     ├── HTML (page-source.html)                                │
│     └── Metadados (JSON)                                       │
│       │                                                        │
│       ▼                                                        │
│  6. Geração de Hashes                                          │
│     ├── Hash de cada arquivo                                   │
│     └── hashes.json                                            │
│       │                                                        │
│       ▼                                                        │
│  7. PCC Níveis 1-2                                             │
│     ├── Merkle Tree                                            │
│     └── Certificação do servidor                               │
│       │                                                        │
│       ▼                                                        │
│  8. Upload para S3                                             │
│     ├── Presigned URL                                          │
│     └── Retry (máx 3 tentativas)                               │
│       │                                                        │
│       ▼                                                        │
│  9. Lockdown Desativado                                        │
│       │                                                        │
│       ▼                                                        │
│  10. Backend processa níveis 3-5                               │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Vídeo (Screen Recording)

```
┌────────────────────────────────────────────────────────────────┐
│                    FLUXO VÍDEO                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  1. Usuário clica em "Gravar Vídeo"                            │
│       │                                                        │
│       ▼                                                        │
│  2. PISA - Inicialização Segura                                │
│       │                                                        │
│       ▼                                                        │
│  3. Lockdown Ativado (permite scroll e clique esquerdo)        │
│       │                                                        │
│       ▼                                                        │
│  4. Gravação Iniciada                                          │
│     ├── Captura do viewport                                    │
│     ├── Formato WebM                                           │
│     ├── Duração máxima: 30 minutos                             │
│     └── Timer exibido no overlay                               │
│       │                                                        │
│       ▼                                                        │
│  5. Extração de Frames (durante gravação)                      │
│     ├── Taxa base: 3 segundos                                  │
│     ├── Eventos: scroll, clique, mídia                         │
│     ├── Deduplicação: >= 90% similar descartado                │
│     └── Formato: JPEG 85%                                      │
│       │                                                        │
│       ▼                                                        │
│  6. Usuário clica em "Parar" ou 30 min atingidos               │
│       │                                                        │
│       ▼                                                        │
│  7. Coleta de Dados                                            │
│     ├── Vídeo (WebM)                                           │
│     ├── Frames (JPEG)                                          │
│     ├── HTML (início e fim)                                    │
│     └── Metadados (JSON)                                       │
│       │                                                        │
│       ▼                                                        │
│  8. Geração de Hashes e PCC                                    │
│       │                                                        │
│       ▼                                                        │
│  9. Upload e Lockdown Desativado                               │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Utilitários Criptográficos

### CryptoUtils

**IMPORTANTE**: NUNCA usar implementação própria de hash. Sempre usar `hash-wasm`.

```typescript
// src/lib/crypto-utils.ts

import { sha256 } from 'hash-wasm';

export class CryptoUtils {
  // Hash SHA-256 com timeout de 5 segundos
  static async hash(data: string | object): Promise<string> {
    const input = typeof data === 'object' 
      ? JSON.stringify(data, Object.keys(data).sort())
      : data;
    
    return sha256(input);
  }
  
  // Gerar nonce (mínimo 128 bits)
  static generateNonce(bytes: number = 16): Uint8Array {
    const nonce = new Uint8Array(bytes);
    crypto.getRandomValues(nonce);
    return nonce;
  }
  
  // Conversões
  static arrayBufferToHex(buffer: ArrayBuffer): string;
  static hexToArrayBuffer(hex: string): ArrayBuffer;
  static arrayBufferToBase64(buffer: ArrayBuffer): string;
}
```

### HashGenerator

```typescript
// src/lib/hash-generator.ts

export class HashGenerator {
  // Processar em chunks para não bloquear UI
  static async hashFile(file: Blob): Promise<string> {
    const CHUNK_SIZE = 1024 * 1024; // 1MB
    // Processar arquivo em chunks
  }
  
  // Hash de metadados com ordenação de chaves
  static async hashMetadata(metadata: object): Promise<string> {
    const sorted = JSON.stringify(metadata, Object.keys(metadata).sort());
    return CryptoUtils.hash(sorted);
  }
}
```

## Resiliência e Circuit Breaker

### Circuit Breaker

```
┌────────────────────────────────────────────────────────────────┐
│                    ESTADOS CIRCUIT BREAKER                     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────┐                                                  │
│  │  CLOSED  │◀────────────────────────────────────┐            │
│  │ (Normal) │                                     │            │
│  └────┬─────┘                                     │            │
│       │                                           │            │
│       │ 5 falhas consecutivas                     │ Sucesso    │
│       ▼                                           │            │
│  ┌──────────┐                              ┌──────┴─────┐      │
│  │   OPEN   │─────────────────────────────▶│ HALF_OPEN  │      │
│  │ (Falha)  │     Timeout de reset         │  (Teste)   │      │
│  └──────────┘                              └────────────┘      │
│                                                   │            │
│                                                   │ Falha      │
│                                                   ▼            │
│                                            Volta para OPEN     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Configuração por Serviço

| Serviço | Failure Threshold | Reset Timeout | Half-Open Requests |
|---------|-------------------|---------------|-------------------|
| ICP-Brasil | 5 | 5 minutos | 1 |
| Blockchain | 5 | 1 minuto | 2 |
| Canal Seguro | 3 | 30 segundos | 1 |

### Retry com Backoff

```typescript
// Backoff exponencial com jitter (30% variação)
const delay = Math.min(
  initialDelay * Math.pow(2, attempt),
  maxDelay
) * (1 + (Math.random() - 0.5) * 0.6); // 30% jitter
```

## Auditoria e Logs

### AuditLogger

```typescript
// src/lib/audit-logger.ts

export class AuditLogger {
  private correlationId: string;
  private traceId: string;
  private entries: LogEntry[] = [];
  
  constructor() {
    this.correlationId = crypto.randomUUID();
    this.traceId = this.generateXRayTraceId();
  }
  
  info(process: string, event: string, data: object): void;
  warn(process: string, event: string, data: object): void;
  error(process: string, event: string, data: object): void;
  critical(process: string, event: string, data: object): void;
  
  // Gerar audit trail completo
  generateAuditTrail(): AuditTrail;
}
```

### Formato de Log

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "process": "PISA",
  "event": "STAGE_0_COMPLETE",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "traceId": "1-5f84c7a7-abcdef012345678912345678",
  "elapsedMs": 150,
  "data": {
    "hash": "abc123...",
    "url": "https://example.com"
  }
}
```

### Processos Logados

- `PISA`: Inicialização segura
- `LOCKDOWN`: Proteções de segurança
- `PCC`: Certificação em cascata
- `UPLOAD`: Upload para S3
- `CAPTURE`: Captura de screenshot/vídeo

## Extension Isolation Mode

O Modo de Isolamento de Extensões desativa temporariamente todas as extensões de terceiros durante a captura para garantir integridade da prova digital.

### Fluxo de Isolamento

```
┌────────────────────────────────────────────────────────────────┐
│                    FLUXO DE ISOLAMENTO                         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  1. Usuário clica em "Capturar"                                │
│       │                                                        │
│       ▼                                                        │
│  2. activateIsolation()                                        │
│     ├── Listar extensões (chrome.management.getAll)            │
│     ├── Filtrar elegíveis (excluir Lexato, themes, admin)      │
│     ├── Criar snapshot com hash SHA-256                        │
│     ├── Persistir snapshot (chrome.storage.local)              │
│     └── Desativar extensões em paralelo (timeout 30s)          │
│       │                                                        │
│       ▼                                                        │
│  3. PISA + Captura (com hash do snapshot na cadeia)            │
│       │                                                        │
│       ▼                                                        │
│  4. deactivateIsolation() [sempre em finally]                  │
│     ├── Carregar e validar snapshot                            │
│     ├── Restaurar extensões em paralelo (timeout 30s)          │
│     └── Remover snapshot após sucesso                          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Testando o Isolamento

#### Mocks Necessários

```typescript
// Mock do chrome.management API
const mockManagementAPI = {
  getAll: vi.fn(),
  setEnabled: vi.fn(),
  getSelf: vi.fn(),
};

// Mock do chrome.storage.local
const mockStorage = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
};

// Mock do chrome.runtime
const mockRuntime = {
  id: 'lexato_extension_id_123',
  getManifest: vi.fn(() => ({ version: '1.0.0' })),
};

// Configurar mocks globais
vi.stubGlobal('chrome', {
  management: mockManagementAPI,
  storage: { local: mockStorage },
  runtime: mockRuntime,
});
```

#### Helper para Criar ExtensionInfo

```typescript
function createMockExtensionInfo(
  overrides: Partial<chrome.management.ExtensionInfo> = {}
): chrome.management.ExtensionInfo {
  return {
    id: `ext_${Math.random().toString(36).substring(2, 9)}`,
    name: 'Test Extension',
    description: 'A test extension',
    version: '1.0.0',
    enabled: true,
    mayDisable: true,
    installType: 'normal',
    type: 'extension',
    homepageUrl: '',
    updateUrl: '',
    offlineEnabled: false,
    optionsUrl: '',
    permissions: [],
    hostPermissions: [],
    ...overrides,
  };
}
```

#### Exemplo de Teste Unitário

```typescript
describe('ExtensionIsolationManager', () => {
  let manager: ExtensionIsolationManager;
  let logger: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new AuditLogger('test-correlation-id');
    manager = new ExtensionIsolationManager(logger);

    // Configurar mocks padrão
    mockManagementAPI.getAll.mockResolvedValue([]);
    mockManagementAPI.setEnabled.mockResolvedValue(undefined);
    mockStorage.get.mockResolvedValue({});
    mockStorage.set.mockResolvedValue(undefined);
    mockStorage.remove.mockResolvedValue(undefined);
  });

  it('deve ativar isolamento com sucesso', async () => {
    const extensions = [
      createMockExtensionInfo({ id: 'ext_1', enabled: true }),
      createMockExtensionInfo({ id: 'ext_2', enabled: true }),
    ];
    mockManagementAPI.getAll.mockResolvedValue(extensions);

    const result = await manager.activateIsolation('test-correlation-id');

    expect(result.success).toBe(true);
    expect(result.disabledExtensions).toHaveLength(2);
    expect(mockManagementAPI.setEnabled).toHaveBeenCalledTimes(2);
  });
});
```

#### Testes de Propriedade (Property-Based Testing)

Os testes de propriedade usam **fast-check** para validar comportamentos universais:

```typescript
import * as fc from 'fast-check';

// Arbitrary para gerar ExtensionInfo
const extensionInfoArbitrary = fc.record({
  id: fc.string({ minLength: 10, maxLength: 32 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  enabled: fc.boolean(),
  mayDisable: fc.boolean(),
  installType: fc.constantFrom('admin', 'development', 'normal', 'sideload', 'other'),
  type: fc.constantFrom('extension', 'theme', 'hosted_app'),
  // ... outros campos
});

// Property 1: Lexato NUNCA deve ser desativada
it('NUNCA deve incluir extensão Lexato na lista de desativação', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(extensionInfoArbitrary, { maxLength: 20 }),
      async (extensions) => {
        const withLexato = [
          ...extensions,
          createMockExtensionInfo({ id: mockRuntime.id, name: 'Lexato' }),
        ];
        mockManagementAPI.getAll.mockResolvedValue(withLexato);

        const preview = await manager.previewIsolation();

        // Lexato NUNCA deve estar na lista
        const hasLexato = preview.extensionsToDisable.some(
          (e) => e.id === mockRuntime.id
        );
        expect(hasLexato).toBe(false);
      }
    ),
    { numRuns: 100 }
  );
});
```

### Propriedades Testadas

| Property | Descrição | Requirements |
|----------|-----------|--------------|
| 1 | Filtragem correta (excluir Lexato, themes, mayDisable: false) | 2.2, 2.4, 2.5 |
| 2 | Integridade do snapshot (campos obrigatórios, hash SHA-256) | 3.2, 3.3, 3.5, 10.1 |
| 3 | Consistência de desativação (apenas elegíveis, logs) | 4.2, 4.4, 4.5 |
| 4 | Consistência de restauração (apenas wasEnabled: true) | 5.2, 5.4 |
| 5 | Garantia de restauração (sempre em finally) | 6.5, 5.6 |
| 6 | Invariante Lexato ativa (nunca desativada) | 10.2 |
| 7 | Auditoria completa (logs de todas operações) | 9.1-9.7 |
| 8 | Ordem de operações PISA (isolamento antes de H0) | 6.1, 6.2, 6.7 |
| 9 | Detecção de violações (reativação, nova extensão) | 10.3, 10.4 |

### Executando Testes de Isolamento

```bash
# Rodar todos os testes de isolamento
npm test -- --run tests/unit/background/extension-isolation-manager.test.ts 2>&1 | tail -30

# Rodar apenas testes de propriedade
npm test -- --run tests/unit/background/extension-isolation-manager.test.ts -t "Property" 2>&1 | tail -30
```

### Recuperação de Falhas

O sistema implementa recuperação automática:

1. **Startup**: `checkPendingSnapshots()` verifica e restaura snapshots órfãos
2. **Timeout**: Snapshots com mais de 1 hora são limpos automaticamente
3. **Falha de restauração**: Snapshot mantido para retry via `forceRestore()`
4. **Erro não tratado**: Restauração garantida via `finally` no fluxo de captura

---

**Próximos passos:**
- [README.md](../README.md) - Visão geral do projeto
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Arquitetura detalhada
