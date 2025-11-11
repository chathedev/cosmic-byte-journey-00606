import React from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log for debugging
    console.error("Unhandled app error:", error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <article className="max-w-md w-full border border-border rounded-lg bg-card p-6 shadow-sm">
            <header>
              <h1 className="text-xl font-semibold text-card-foreground">Något gick fel</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sidan kunde inte visas. Försök igen eller ladda om.
              </p>
            </header>
            {this.state.error && (
              <pre className="mt-4 text-xs text-muted-foreground/80 max-h-32 overflow-auto bg-muted/30 p-3 rounded">
                {this.state.error.message}
              </pre>
            )}
            <div className="mt-5 flex gap-2">
              <Button onClick={this.handleRetry} size="sm">Försök igen</Button>
              <Button onClick={() => window.location.reload()} variant="secondary" size="sm">Ladda om</Button>
            </div>
          </article>
        </div>
      );
    }

    return this.props.children;
  }
}
