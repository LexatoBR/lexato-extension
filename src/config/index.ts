/**
 * @fileoverview Exportações do módulo de configuração da extensão Chrome
 * @author Equipe Lexato
 * @created 2026-01-29
 */

export {
  clearEnvironmentCache,
  DEFAULT_ENVIRONMENT,
  detectCurrentEnvironment,
  environments,
  getApiUrl,
  getAppUrl,
  getCdnUrl,
  getCurrentEnv,
  getEnvironment,
  getEnvironmentConfig,
  getSentryEnvironment,
  getWsUrl,
  isDebugEnabled,
  isDev,
  isProd,
  isStaging,
  isValidEnvironment,
  VALID_ENVIRONMENTS,
  type Environment,
  type EnvironmentConfig,
} from './environment';
