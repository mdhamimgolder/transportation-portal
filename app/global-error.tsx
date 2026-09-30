"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, so it
 * must render its own <html>/<body> and cannot rely on the app's CSS being
 * loaded — styles are inline on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] fatal error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f3ec",
          color: "#14231d",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div
            style={{
              height: 4,
              background: "#70bccc",
              borderRadius: "4px 4px 0 0",
            }}
          />
          <div
            style={{
              border: "1px solid #e2ded1",
              borderTop: "none",
              borderRadius: "0 0 12px 12px",
              background: "#fdfcf8",
              padding: "32px",
            }}
          >
            <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>
              The portal is temporarily unavailable
            </h1>
            <p style={{ fontSize: 14, color: "#5c6b64", margin: "0 0 20px" }}>
              A server error stopped this page from loading. Please retry — if it
              keeps happening, tell the Facilities IT contact.
            </p>
            {error.digest ? (
              <p
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 11,
                  color: "#8a968f",
                  margin: "0 0 20px",
                }}
              >
                ref: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={reset}
              style={{
                background: "#70bccc",
                color: "#03120f",
                border: "none",
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
