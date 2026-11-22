import { type SupportedLocale, t } from "@agenticf/domain";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

export interface TabErrorBoundaryProps {
  readonly resetKey: string;
  readonly locale: SupportedLocale;
  readonly children: ReactNode;
}

interface TabErrorBoundaryState {
  readonly hasError: boolean;
}

export class TabErrorBoundary extends Component<
  TabErrorBoundaryProps,
  TabErrorBoundaryState
> {
  override state: TabErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): TabErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidUpdate(prevProps: TabErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Error UI is rendered cleanly via getDerivedStateFromError.
  }

  private readonly handleRetry = () => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { locale } = this.props;
    return (
      <div
        role="alert"
        className="mx-auto my-8 max-w-md rounded-2xl border border-rose-500/30 bg-rose-950/30 p-6 text-center"
      >
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="mt-3 text-base font-semibold text-(--text-primary)">
          {t(locale, "shell.errorBoundaryTitle")}
        </h2>
        <p className="mt-1.5 text-sm text-(--text-secondary)">
          {t(locale, "shell.errorBoundaryDesc")}
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>{t(locale, "shell.retry")}</span>
        </button>
      </div>
    );
  }
}
