/**
 * Exportações dos componentes do Side Panel
 *
 * @module SidePanelComponents
 */

export { default as NavigationHistory } from './NavigationHistory';
export type { NavigationHistoryProps } from './NavigationHistory';

export { default as IntegrityHashViewer } from './IntegrityHashViewer';
export type { IntegrityHashViewerProps, VideoChunk } from './IntegrityHashViewer';

export { default as ConnectionQuality, ConnectionQualityCompact } from './ConnectionQuality';
export type { ConnectionQualityProps, ConnectionQualityState, QualityLevel, ConnectionType } from './ConnectionQuality';

export { default as HelpGuide, HelpGuideInline } from './HelpGuide';
export type { HelpGuideProps, GuideStep } from './HelpGuide';

export { default as ForensicContextEnhanced } from './ForensicContextEnhanced';
export type { ForensicContextEnhancedProps, EnhancedForensicContext } from './ForensicContextEnhanced';
