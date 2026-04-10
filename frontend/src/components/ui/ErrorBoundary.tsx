import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white px-4">
          <div className="text-center max-w-md">
            <img src="/logo-icon.png" alt="MaidLink" className="h-12 w-auto mx-auto mb-6 opacity-50" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-500 mb-6">
              An unexpected error occurred. Please refresh the page to try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary px-6 py-2.5 text-sm"
            >
              Refresh page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
