// App-wide error boundary. If a screen throws while it draws, the reader gets the designed error screen
// (what failed, why Redshift shows nothing rather than guess, a reload) instead of a blank page.
// App.tsx wraps the routes in it and passes the path as resetKey, so Back or a link recovers.
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** When this changes, the error is cleared and the children are drawn again. */
  resetKey?: string;
  /** What Reload does; tests pass their own because jsdom cannot reload a page. */
  onReload?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorScreen error={this.state.error} onReload={this.props.onReload ?? (() => window.location.reload())} />;
  }
}

// A lazily loaded screen whose file is gone (usually because the site was updated) fails with one of these.
const CHUNK = /dynamically imported module|importing a module script failed|loading chunk|failed to fetch/i;

export function ErrorScreen({ error, onReload }: { error: Error; onReload: () => void }) {
  const base = import.meta.env.BASE_URL;
  const missingCode = CHUNK.test(error.message);
  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--bg)] px-4 py-6 sm:px-8">
      <a href={base} className="flex items-center gap-2 self-start" aria-label="Redshift, the plane">
        <img src={`${base}favicon.svg`} alt="" className="h-6 w-6" />
        <span className="text-base font-semibold tracking-tight">Redshift</span>
      </a>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 py-12" role="alert" aria-labelledby="app-error-title">
        <span className="eyebrow">This screen stopped</span>
        <h1 id="app-error-title" className="text-xl font-semibold">
          {missingCode ? "Part of Redshift did not download." : "Something failed while this screen was drawing."}
        </h1>
        <p className="text-base text-ink-2">
          Redshift shows nothing it cannot source. When a screen cannot finish, it stops here rather than show a
          half-drawn page or a number it cannot trace. Your view is kept in the address bar, so a reload brings you
          back to the same place.
        </p>
        <div className="w-full rounded-lg border border-line bg-surface-2 px-4 py-3">
          <span className="eyebrow">What failed</span>
          <p className="mono mt-1 break-words text-sm text-ink-2">{error.message || error.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={onReload}>Reload the page</button>
          <a className="btn" href={base}>Open the plane</a>
        </div>
      </main>
    </div>
  );
}
