/**
 * Componentes de Layout da Extensão Chrome Lexato
 *
 * Exporta componentes estruturais para o layout da extensão:
 * - Header: Cabeçalho com contexto, créditos e notificações
 * - EnvironmentIndicator: Indicador de integridade do ambiente
 *
 * @module components/layout
 */

export { Header } from './Header';
export type { HeaderProps } from './Header';

export { EnvironmentIndicator } from './EnvironmentIndicator';
export type {
  EnvironmentIndicatorProps,
  EnvironmentStatus,
  EnvironmentCheck,
} from './EnvironmentIndicator';
