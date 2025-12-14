import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#fca5a5', backgroundColor: '#450a0a', border: '1px solid #7f1d1d', margin: '2rem', borderRadius: '8px' }}>
          <h1>Ocorreu um Erro Inesperado.</h1>
          <p>A aplicação encontrou um problema e não pode ser carregada.</p>
          <p>Por favor, tente recarregar a página. Se o problema persistir, verifique o console do navegador (F12) para mais detalhes.</p>
          <pre style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#111', color: '#999', textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.8rem', borderRadius: '4px' }}>
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
