import React from 'react';

/***
 * MARK: ErrorBoundary
 * @description Catches runtime React errors in child component trees, logs them,
 * and renders an accessible, high-contrast fallback UI with recovery actions.
 * @example
 * <ErrorBoundary name="Canvas">
 *   <WorkflowCanvas />
 * </ErrorBoundary>
 ***/
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error(
      '[ErrorBoundary]',
      this.props?.name || 'Global',
      'Uncaught render error:',
      error,
      errorInfo,
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="p-6 m-4 bg-surface-deep border border-error/50 rounded-sm shadow-xl flex flex-col items-center justify-center text-center space-y-4 max-w-xl mx-auto"
        >
          <div className="w-12 h-12 rounded-full bg-error/20 border border-error/40 flex items-center justify-center text-error text-2xl font-bold">
            ⚠️
          </div>
          <div>
            <h2 className="text-base font-bold uppercase tracking-wider text-on-surface">
              {this.props.name
                ? `${this.props.name} Component Error`
                : 'Unexpected UI Rendering Error'}
            </h2>
            <p className="text-xs text-text-muted mt-1 max-w-md">
              A problem occurred while rendering this section. You can attempt to recover or reload
              the application.
            </p>
          </div>

          {this.state.error && (
            <div className="w-full text-left bg-surface-container p-3 rounded-sm border border-border-standard overflow-x-auto">
              <code className="text-[11px] font-mono text-error font-semibold break-all">
                {this.state.error.toString()}
              </code>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 min-h-[44px] bg-primary text-on-primary rounded-sm text-xs font-bold uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              Try to Recover
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 min-h-[44px] bg-surface-container border border-border-standard text-on-surface rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-surface-container-high active:scale-95 transition-all cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
