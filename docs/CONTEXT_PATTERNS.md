# Padrões de Contexto de Execução - Extensão Chrome Lexato

Este documento descreve os padrões de código para lidar com diferentes contextos de execução na extensão Chrome do Lexato, especialmente a distinção entre Service Worker (sem DOM) e Content Script/Offscreen Document (com DOM).

## Contextos de Execução

A extensão Chrome Manifest V3 possui diferentes contextos de execução, cada um com suas próprias limitações:

| Contexto | Acesso ao DOM | APIs Chrome | Uso Principal |
|----------|---------------|-------------|---------------|
| Service Worker | ❌ Não | ✅ Completo | Background, handlers, orquestração |
| Content Script | ✅ Sim | ⚠️ Limitado | Interação com página web |
| Offscreen Document | ✅ Sim | ⚠️ Limitado | MediaRecorder, Canvas, operações DOM |
| Popup/Options | ✅ Sim | ✅ Completo | Interface do usuário |

## Problema: "document is not defined"

O erro mais comum ocorre quando código que usa DOM é importado em Service Worker:

```typescript
// ❌ INCORRETO - Causa erro em Service Worker
import { SSLCollector } from './collectors/ssl-collector';
// SSLCollector usa document.querySelectorAll internamente
// Mesmo sem chamar o collector, o import já falha!
```

## Solução: Dynamic Imports com Guards

### 1. Usar `hasDOMAccess()` antes de Dynamic Imports

```typescript
import { hasDOMAccess } from '@lib/context-utils';

// ✅ CORRETO - Verifica contexto antes do import
async function coletarSSL(url: string) {
  if (!hasDOMAccess()) {
    logger.warn('[SSL] Pulando coleta - contexto sem DOM');
    return null;
  }
  
  // Dynamic import só executa se tiver DOM
  const { SSLCollector } = await import('./collectors/ssl-collector');
  const collector = new SSLCollector(logger, url);
  return collector.collect();
}
```

### 2. Usar `loadDOMCollector()` do Safe Loader

```typescript
import { loadDOMCollector } from '@lib/forensic/safe-loader';

// ✅ CORRETO - Safe loader já faz a verificação
const result = await loadDOMCollector<SSLData>(
  './collectors/ssl-collector',
  logger,
  url
);

if (result?.success) {
  console.log('Dados SSL:', result.data);
}
```

## Categorização de Collectors

### Collectors DOM-Safe (podem ser importados estaticamente)

Estes collectors usam apenas APIs disponíveis em Service Worker:

- `GeolocationCollector` - navigator.geolocation
- `NetworkCollector` - fetch API
- `DeviceCollector` - navigator properties
- `DNSCollector` - fetch para APIs DNS
- `StorageCollector` - chrome.storage
- `PerformanceCollector` - Performance API
- `WaybackCollector` - fetch API
- `AudioFingerprintCollector` - AudioContext
- `HTTPHeadersCollector` - fetch API
- `TimezoneCollector` - Intl API
- `BatteryCollector` - navigator.getBattery
- `MediaDevicesCollector` - navigator.mediaDevices
- `WebRTCCollector` - RTCPeerConnection
- `ServiceWorkersCollector` - navigator.serviceWorker
- `PermissionsCollector` - navigator.permissions
- `WhoisFreaks*Collector` - fetch API

### Collectors DOM-Required (requerem dynamic import)

Estes collectors usam APIs que requerem DOM:

| Collector | API DOM Usada | Alternativa em SW |
|-----------|---------------|-------------------|
| `SSLCollector` | document.querySelectorAll | Verificação parcial via URL |
| `PageResourcesCollector` | document.querySelectorAll | Não disponível |
| `CanvasFingerprintCollector` | document.createElement('canvas') | Não disponível |
| `WebGLFingerprintCollector` | document.createElement('canvas') | Não disponível |
| `FontsCollector` | document.fonts | Não disponível |

## Utilitários de Contexto

### context-utils.ts

```typescript
import {
  hasDOMAccess,
  isServiceWorker,
  isContentScript,
  isOffscreenDocument,
  isExtensionPage,
  detectExecutionContext,
  isAPIAvailable,
  withDOMAccess,
  withDOMAccessAsync,
} from '@lib/context-utils';

// Verificar se tem DOM
if (hasDOMAccess()) {
  const title = document.title;
}

// Verificar contexto específico
if (isServiceWorker()) {
  // Usar message passing
}

// Detectar contexto atual
const context = detectExecutionContext();
// Retorna: 'service-worker' | 'content-script' | 'offscreen-document' | 'extension-page' | 'unknown'

// Verificar API específica
if (isAPIAvailable('navigator.mediaDevices')) {
  const stream = await navigator.mediaDevices.getDisplayMedia();
}

// Executar com fallback
const title = withDOMAccess(() => document.title, 'Título não disponível');
```

### safe-loader.ts

```typescript
import {
  loadDOMCollector,
  loadDOMCollectorWithOptions,
  canLoadDOMCollector,
  isDOMRequiredCollector,
  DOM_REQUIRED_COLLECTORS,
} from '@lib/forensic/safe-loader';

// Verificar antes de carregar
if (canLoadDOMCollector('ssl-collector', logger)) {
  const result = await loadDOMCollector('./collectors/ssl-collector', logger, url);
}

// Carregar com opções
const result = await loadDOMCollectorWithOptions<SSLData>(
  './collectors/ssl-collector',
  logger,
  { timeout: 5000, logSkipped: true },
  url
);

// Verificar se collector requer DOM
if (isDOMRequiredCollector('canvas-fingerprint-collector')) {
  // Usar dynamic import
}
```

## Padrões de Código

### Padrão 1: Guard no Início da Função

```typescript
async function operacaoComDOM() {
  if (!hasDOMAccess()) {
    logger.warn('[Operação] Contexto sem DOM - operação ignorada');
    return { success: false, error: 'Contexto sem DOM' };
  }
  
  // Código que usa DOM...
}
```

### Padrão 2: Dynamic Import Condicional

```typescript
async function coletarDados() {
  const resultados = [];
  
  // Collectors DOM-safe - import estático OK
  const { NetworkCollector } = await import('./collectors/network-collector');
  resultados.push(await new NetworkCollector(logger).collect());
  
  // Collectors DOM-required - verificar antes
  if (hasDOMAccess()) {
    const { SSLCollector } = await import('./collectors/ssl-collector');
    resultados.push(await new SSLCollector(logger, url).collect());
  }
  
  return resultados;
}
```

### Padrão 3: Degradação Graciosa

```typescript
async function coletarFingerprint() {
  if (!hasDOMAccess()) {
    return {
      success: true,
      data: {
        available: false,
        error: 'Canvas fingerprint não disponível em Service Worker',
      },
      durationMs: 0,
    };
  }
  
  // Coleta normal com DOM...
}
```

### Padrão 4: Message Passing para Operações DOM

```typescript
// Em Service Worker
async function obterTituloPagina(tabId: number): Promise<string> {
  // Não temos DOM, usar message passing
  const response = await chrome.tabs.sendMessage(tabId, {
    type: 'GET_PAGE_TITLE',
  });
  return response.title;
}

// Em Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PAGE_TITLE') {
    sendResponse({ title: document.title });
  }
});
```

## Processo de Auditoria para Novo Código

Ao adicionar novo código que pode ser executado em Service Worker:

1. **Identificar APIs usadas**
   - Listar todas as APIs do navegador usadas
   - Verificar se alguma requer DOM (document.*, window.*, etc.)

2. **Categorizar o módulo**
   - DOM-safe: Pode ser importado estaticamente
   - DOM-required: Deve usar dynamic import

3. **Adicionar guards apropriados**
   - Se DOM-required, adicionar `hasDOMAccess()` guard
   - Implementar degradação graciosa

4. **Atualizar documentação**
   - Adicionar JSDoc indicando requisitos de contexto
   - Atualizar lista de collectors se aplicável

5. **Adicionar testes**
   - Testar em contexto com DOM
   - Testar em contexto sem DOM (degradação graciosa)

## Checklist de Revisão

- [ ] Módulo usa APIs DOM? Se sim, é DOM-required
- [ ] Imports estáticos são todos DOM-safe?
- [ ] Dynamic imports têm guard `hasDOMAccess()`?
- [ ] Degradação graciosa implementada?
- [ ] Logs indicam quando operação é pulada?
- [ ] Testes cobrem ambos os contextos?

## Referências

- [Chrome Extension Service Workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers)
- [Offscreen Documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Message Passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- `src/lib/context-utils.ts` - Utilitários de contexto
- `src/lib/forensic/safe-loader.ts` - Safe loader para collectors
- `src/lib/service-worker-polyfills.ts` - Polyfills para bibliotecas externas

## Polyfills para Bibliotecas Externas

Algumas bibliotecas de terceiros acessam APIs DOM em tempo de carregamento do módulo, antes que qualquer configuração seja aplicada. Isso causa erros mesmo quando a biblioteca seria usada de forma compatível com Service Worker.

### Problema: Axios e document.cookie

O Axios v1.7+ avalia `platform.hasStandardBrowserEnv` em tempo de carregamento, acessando `document.cookie` para verificar suporte a XSRF. Isso causa erro "document is not defined" em Service Workers.

```typescript
// ❌ INCORRETO - Erro em Service Worker
import axios from 'axios';
// O import já falha porque axios acessa document.cookie!
```

### Solução: service-worker-polyfills.ts

O módulo `service-worker-polyfills.ts` fornece stubs mínimos para APIs DOM que bibliotecas externas podem acessar:

```typescript
// ✅ CORRETO - Importar polyfill PRIMEIRO no service-worker.ts
import './service-worker-polyfills';

// Agora axios pode ser importado sem erro
import axios from 'axios';
```

### Como Funciona

1. O polyfill verifica se está em contexto de Service Worker
2. Se `document` não existe, cria um stub mínimo com `cookie: ''`
3. O stub é marcado com `POLYFILL_MARKER` para identificação
4. Bibliotecas como axios funcionam normalmente com adapter 'fetch'

### Uso do Módulo

```typescript
import {
  aplicarDocumentStub,
  isDocumentStubActive,
  removerDocumentStub,
  POLYFILL_MARKER,
} from '@lib/service-worker-polyfills';

// Verificar se stub está ativo
if (isDocumentStubActive()) {
  console.log('Usando stub de document para compatibilidade');
}

// O stub é aplicado automaticamente na importação
// Não é necessário chamar aplicarDocumentStub() manualmente
```

### Bibliotecas Conhecidas que Requerem Polyfill

| Biblioteca | API Acessada | Versão Afetada |
|------------|--------------|----------------|
| axios | document.cookie | v1.7+ |

### Adicionando Suporte para Novas Bibliotecas

Se encontrar uma biblioteca que causa erro similar:

1. Identificar qual API DOM está sendo acessada
2. Adicionar stub mínimo em `service-worker-polyfills.ts`
3. Documentar na tabela acima
4. Adicionar teste unitário
