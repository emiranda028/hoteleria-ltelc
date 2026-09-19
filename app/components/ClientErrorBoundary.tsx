"use client";

import React from "react";

type State = { hasError: boolean; msg: string; stack: string };

export class ClientErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, msg: "", stack: "" };
  }

  static getDerivedStateFromError(err: any) {
    return { hasError: true, msg: String(err?.message ?? err), stack: String(err?.stack ?? "") };
  }

  componentDidCatch(err: any) {
    // por si querés loguear
    console.error("ClientErrorBoundary:", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16 }}>
          <div
            style={{
              borderRadius: 18,
              padding: 16,
              border: "1px solid rgba(255,0,0,.35)",
              background: "rgba(255,0,0,.06)",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Se rompió la app en el cliente</div>
            <div style={{ fontFamily: "monospace", whiteSpace: "pre-wrap", fontSize: 12 }}>
              {this.state.msg}
              {"\n\n"}
              {this.state.stack}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
