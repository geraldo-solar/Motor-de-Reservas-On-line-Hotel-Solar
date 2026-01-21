import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        if ((window as any).logError) {
            (window as any).logError(error.message, error.stack + '\n' + JSON.stringify(errorInfo));
        }
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '50px', background: 'red', color: 'white', minHeight: '100vh', zIndex: 999999 }}>
                    <h1 style={{ fontSize: '40px' }}>ERRO CRÍTICO</h1>
                    <p style={{ fontSize: '20px' }}>{this.state.error?.message}</p>
                    <pre style={{ background: 'black', padding: '20px' }}>{this.state.error?.stack}</pre>
                    <button onClick={() => window.location.reload()} style={{ padding: '20px', fontSize: '20px' }}>RECARREGAR</button>
                </div>
            );
        }

        return (this as any).props.children;
    }
}
