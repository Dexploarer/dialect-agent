import React from 'react';

type ErrorBoundaryState = { hasError: boolean; error?: unknown };

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    // Prefer structured logging tool if available
    console.error('ErrorBoundary caught error', { error, errorInfo });
  }

  private handleHardReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.replace('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6">
          <div className="max-w-md w-full space-y-4 text-center">
            <h1 className="text-xl font-semibold text-red-600 dark:text-red-400">Oops! Something went wrong</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              The page failed to render. You can refresh the app or go back to the dashboard.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleHardReload}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium"
              >
                Refresh App
              </button>
              <button
                onClick={this.handleGoHome}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}

export default ErrorBoundary;


