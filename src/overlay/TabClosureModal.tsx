

export interface TabClosureModalProps {
    onStopAndSave: () => void;
    onCancel: () => void;
    isOpen: boolean;
}

const MODAL_Z_INDEX = 2147483648; // Above overlay

export default function TabClosureModal({ onStopAndSave, onCancel, isOpen }: TabClosureModalProps) {
    if (!isOpen) {return null;}

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: MODAL_Z_INDEX,
            fontFamily: "'Inter', sans-serif"
        }}>
            <div style={{
                background: '#161519', // Vulcan
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                padding: '24px',
                maxWidth: '400px',
                width: '90%',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 0 10px rgba(239, 83, 80, 0.2)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '8px',
                        backgroundColor: 'rgba(239, 83, 80, 0.15)',
                        color: '#EF5350', // Error color
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                    </div>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#F7F9FB', margin: 0 }}>
                        Atenção: Gravação em Andamento
                    </h2>
                </div>

                <p style={{ color: 'rgba(247, 249, 251, 0.7)', fontSize: '14px', lineHeight: '1.5', marginBottom: '24px' }}>
                    Se você fechar esta aba agora, a evidência poderá ser perdida ou corrompida. Deseja parar a gravação e salvar o que foi capturado até agora?
                </p>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: '#F7F9FB',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 500,
                            transition: 'all 0.2s'
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onStopAndSave}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: 'linear-gradient(135deg, #00DEA5, #009978)',
                            border: 'none',
                            color: '#FFFFFF',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 600,
                            boxShadow: '0 4px 12px rgba(0, 222, 165, 0.2)'
                        }}
                    >
                        Parar e Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}
