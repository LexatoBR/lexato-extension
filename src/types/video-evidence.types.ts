import { CaptureMetadata } from './capture.types';
import { ChunkManifestData } from '../background/chunk-manager';
import { TabIsolationManifestSection } from '../background/tab-isolation-manager';

/**
 * Manifesto de evidência de vídeo forense
 * 
 * Contém todos os dados necessários para validar a integridade
 * e autenticidade da prova de vídeo.
 */
export interface VideoEvidenceManifest {
    /** ID único da captura */
    captureId: string;
    /** Timestamp de início */
    startedAt: string;
    /** Timestamp de fim */
    endedAt: string;
    /** Duração total em segundos */
    durationSeconds: number;
    /** Número total de chunks */
    totalChunks: number;
    /** Tamanho total em bytes */
    totalSizeBytes: number;

    /** Hash SHA-256 do arquivo de manifesto (calculado externamente) */
    manifestHash?: string;
    /** Merkle Root dos chunks de vídeo */
    merkleRoot: string;

    /** Lista de chunks com hashes e metadados */
    chunks: ChunkManifestData[];

    /** Dados de isolamento de abas */
    isolation: TabIsolationManifestSection;

    /** Metadados da página capturada */
    metadata: CaptureMetadata;

    /** Informações técnicas do vídeo */
    videoInfo: {
        mimeType: string;
        width?: number;
        height?: number;
        frameRate?: number;
    };

    /** Assinatura digital (se aplicável) */
    signature?: string;

    /** Dados de registro em Blockchain */
    blockchain?: {
        network: 'polygon' | 'arbitrum';
        txHash: string;
        blockNumber?: number;
        timestamp?: string;
    };
}
