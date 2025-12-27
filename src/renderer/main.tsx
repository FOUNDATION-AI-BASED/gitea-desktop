import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui/App";
import "./ui/app.css";

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null; stack: string | null }
> {
  state = { error: null as string | null, stack: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { error: String(err), stack: null };
  }

  componentDidCatch(err: unknown) {
    this.setState({ error: String(err), stack: err instanceof Error ? err.stack ?? null : null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app">
        <div className="panel grid">
          <div className="title">App crashed while rendering</div>
          <div className="muted">Check the developer console for details.</div>
          <div className="code">{this.state.error}</div>
          {this.state.stack ? <pre className="code">{this.state.stack}</pre> : null}
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
