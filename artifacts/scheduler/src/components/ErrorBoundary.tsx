import { Component, ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: "#f87171", background: "#0f1c2e", minHeight: "100vh" }}>
          <h2 style={{ color: "#f5c842" }}>Something went wrong</h2>
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{this.state.error.message}</pre>
          <button onClick={() => { this.setState({ error: null }); window.location.href = "/scheduler/"; }} style={{ marginTop: 16, padding: "8px 16px", background: "#f5c842", color: "#0f1c2e", border: "none", borderRadius: 8, cursor: "pointer" }}>
            Go to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
