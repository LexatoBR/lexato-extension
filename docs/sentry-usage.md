# Guia de Uso do Sentry - Extensão Chrome Lexato

## Configuração

O Sentry está configurado para monitorar erros em todos os contextos da extensão Chrome MV3:

- **Service Worker** (background)
- **Popup**
- **Side Panel**
- **Content Scripts**
- **Offscreen Documents**
- **Preview**

## Variáveis de Ambiente

Configure no arquivo `.env`:

```env
# DSN do projeto no Sentry
# Encontre em: Sentry > Settings > Projects > <seu-projeto> > Client Keys
VITE_SENTRY_DSN=https://YOUR_KEY@YOUR_ORG.ingest.us.sentry.io/YOUR_PROJECT_ID

# Para upload de source maps (apenas build)
# Gere em: Sentry > Settings > Auth Tokens
SENTRY_AUTH_TOKEN=YOUR_SENTRY_AUTH_TOKEN
SENTRY_ORG=YOUR_SENTRY_ORG
SENTRY_PROJECT=YOUR_SENTRY_PROJECT
```

## Uso Básico

### Captura Manual de Exceções

```typescript
import { captureException } from '@lib/sentry';

try {
  // Código que pode gerar erro
} catch (error) {
  captureException(error, {
    context: 'nome_do_contexto',
    additionalData: 'dados adicionais'
  });
}
```

### Adicionar Breadcrumbs

```typescript
import { addBreadcrumb } from '@lib/sentry';

// Registra ação do usuário
addBreadcrumb({
  category: 'user',
  message: 'Clicked start capture',
  level: 'info',
  data: { buttonId: 'start-capture' }
});
```

### Captura de Mensagens

```typescript
import { captureMessage } from '@lib/sentry';

// Para logs importantes
captureMessage('Usuário iniciou captura', 'info', {
  captureType: 'video',
  url: window.location.href
});
```

### Definir Contexto do Usuário

```typescript
import { setUser, clearSentryContext } from '@lib/sentry';

// Após login
setUser({
  id: user.id,
  email: user.email,
  name: user.name
});

// Após logout
clearSentryContext();
```

### Wrapper para Funções Assíncronas

```typescript
import { withSentry } from '@lib/sentry';

// Captura erros automaticamente
const result = await withSentry(
  async () => {
    // Código assíncrono
    return await api.fetchData();
  },
  { context: 'api_call' }
);
```

### Error Boundary para Componentes React

```typescript
import { withSentryErrorBoundary } from '@lib/sentry';

const MyComponent = () => {
  // Componente React
};

// Adiciona error boundary com Sentry
export default withSentryErrorBoundary(MyComponent, 'MyComponent');
```

## Taxa de Amostragem

As taxas de amostragem são configuradas automaticamente:

- **Production**: 10% dos erros
- **Staging**: 50% dos erros
- **Development**: 100% dos erros (se VITE_SENTRY_DSN estiver configurado)

## Privacidade e Segurança

O Sentry está configurado para:

1. **Remover informações sensíveis**:
   - Cookies
   - Headers de Authorization
   - Tokens de API

2. **Filtrar erros de desenvolvimento**:
   - Erros de "Failed to fetch" em dev
   - Breadcrumbs de console em produção

3. **Contexto específico da extensão**:
   - ID da extensão
   - Versão do manifest
   - Contexto de execução (popup, content, etc.)

## Build com Source Maps

Em produção, os source maps são enviados automaticamente para o Sentry:

```bash
# Build de produção com source maps
npm run build
```

Os source maps são:

1. Enviados para o Sentry
2. Removidos do bundle final (não são distribuídos)

## Debugging

### Verificar se Sentry está ativo

```typescript
// No console do navegador
chrome.storage.local.get(['sentry_initialized'], (result) => {
  console.log('Sentry initialized:', result.sentry_initialized);
});
```

### Forçar erro de teste

```typescript
import { captureException } from '@lib/sentry';

// Teste manual
captureException(new Error('Teste do Sentry'), {
  test: true,
  timestamp: Date.now()
});
```

## Monitoramento de Performance

O Sentry também captura métricas de performance:

- Tempo de carregamento
- Latência de API
- Duração de operações

## Alertas e Notificações

Configure alertas no dashboard do Sentry:

1. Acesse: [https://YOUR_ORG.sentry.io](https://YOUR_ORG.sentry.io)
2. Navegue para o projeto configurado em `SENTRY_PROJECT`
3. Configure alertas em Settings > Alerts

## Troubleshooting

### Sentry não está capturando erros

1. Verifique se `VITE_SENTRY_DSN` está configurado
2. Confirme que o DSN é válido
3. Verifique o console para mensagens de inicialização

### Source maps não estão funcionando

1. Verifique se `SENTRY_AUTH_TOKEN` está configurado
2. Confirme que o token tem permissões de escrita
3. Verifique logs do build para erros de upload

### Muitos eventos sendo enviados

Ajuste a taxa de amostragem em `lib/sentry.ts`:

```typescript
function getSampleRate(): number {
  // Ajustar valores conforme necessário
  return 0.1; // 10% dos eventos
}
```

## Links Úteis

- [Dashboard Sentry](https://sentry.io)
- [Documentação Sentry Browser](https://docs.sentry.io/platforms/javascript/)
- [Sentry para Chrome Extensions](https://docs.sentry.io/platforms/javascript/guides/browser/integrations/extension/)
