import { Component } from 'react';
import { captureRendererException } from '../monitoring/initRenderer.js';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    captureRendererException(error, {
      type: 'react-error-boundary',
      extra: { componentStack: info?.componentStack },
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    const message = this.state.error?.message || 'Something went wrong';
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f8fa] p-6">
        <div className="max-w-lg w-full bg-white border border-red-100 rounded-2xl shadow-sm p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-500">App error</p>
            <h1 className="text-xl font-bold text-slate-900 mt-1">Climeto PWP hit an unexpected error</h1>
            <p className="text-sm text-slate-600 mt-2">
              The error was saved on this PC and sent to monitoring if the internet is available.
              You can reload and continue.
            </p>
          </div>
          <pre className="text-xs text-red-800 bg-red-50 border border-red-100 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap">
            {message}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
            >
              Reload app
            </button>
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
              }}
              className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium"
            >
              Try to continue
            </button>
          </div>
        </div>
      </div>
    );
  }
}
