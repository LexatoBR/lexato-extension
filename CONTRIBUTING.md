# Guia de Contribuição

Obrigado por querer contribuir com o Lexato! Este documento orienta o processo de contribuição.

## Como Contribuir

### Reportando Bugs

1. Verifique se o bug já não foi reportado em [Issues](https://github.com/LexatoBR/lexato-extension/issues)
2. Abra uma issue com o template de bug report
3. Inclua: versão do Chrome, versão da extensão, passos para reproduzir, comportamento esperado vs. atual

### Sugerindo Melhorias

1. Abra uma issue com o template de feature request
2. Descreva o problema que a melhoria resolve
3. Aguarde discussão antes de implementar

### Pull Requests

1. Fork o repositório
2. Crie um branch a partir de `main`:
   ```bash
   git checkout -b feat/minha-funcionalidade
   ```
3. Faça suas alterações seguindo os padrões abaixo
4. Execute os testes:
   ```bash
   npm run test
   npm run typecheck
   npm run lint
   ```
5. Commit usando [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: adiciona suporte a captura de vídeo em 4K
   fix: corrige timeout na renovação de token
   docs: atualiza README com exemplo de configuração
   ```
6. Abra o Pull Request descrevendo as mudanças

## Padrões de Código

### TypeScript
- Tipagem estrita — sem `any` sem justificativa
- Prefira `??` a `||` para nullish coalescing
- Documente funções públicas com JSDoc

### Segurança
- **Nunca** inclua chaves de API, tokens ou credenciais no código
- Todas as credenciais devem vir de variáveis de ambiente (`VITE_*`)
- Para acesso ao Supabase, use sempre o cliente configurado em `src/lib/supabase/client.ts`

### Testes
- Novos recursos devem vir com testes unitários em `tests/unit/`
- Para lógica crítica de segurança/criptografia, adicione testes de propriedade em `tests/property/`
- Mantenha a cobertura de testes acima de 70%:
  ```bash
  npm run test:coverage
  ```

### Componentes React
- Componentes funcionais com hooks
- Prefira composição a herança
- CSS via Tailwind CSS 4 — use tokens do design system em `src/styles/tokens/`

## Configurando o Ambiente de Desenvolvimento

Veja [README.md](README.md#instalação-para-desenvolvimento) para instruções completas.

## Estrutura de Branches

| Branch | Propósito |
|--------|-----------|
| `main` | Código estável, sincronizado com a versão publicada na CWS |
| `develop` | Integração de features em desenvolvimento |
| `feat/*` | Novas funcionalidades |
| `fix/*` | Correções de bugs |
| `docs/*` | Apenas documentação |

## Código de Conduta

Este projeto adota o [Contributor Covenant](https://www.contributor-covenant.org/). Respeite os outros colaboradores e mantenha um ambiente inclusivo e acolhedor.

## Dúvidas?

Entre em contato via [contato@lexato.com.br](mailto:contato@lexato.com.br) ou abra uma [Discussion](https://github.com/LexatoBR/lexato-extension/discussions).
