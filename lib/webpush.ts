import webpush from "web-push";

let configured = false;

// Strips a matching pair of wrapping quotes - pasting straight from a
// .env.local.example line (`KEY="value"`) into Vercel's raw value field,
// quotes included, is a common way a secret ends up malformed.
function cleanEnvValue(value: string | undefined): string | undefined {
  if (!value) return value;
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const unquoted =
    trimmed.length >= 2 && first === last && (first === '"' || first === "'")
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted.trim();
}

// Call before every send — cheap idempotent check, avoids configuring with
// empty strings if env vars aren't set yet during build/import time.
export function ensureWebPushConfigured() {
  if (configured) return;
  // Cleaned defensively - a trailing space/newline or wrapping quotes
  // from pasting these into Vercel's environment variable UI is a
  // common footgun, and web-push rejects a malformed key outright
  // rather than tolerating it itself.
  const publicKey = cleanEnvValue(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKey = cleanEnvValue(process.env.VAPID_PRIVATE_KEY);
  const subject = cleanEnvValue(process.env.VAPID_SUBJECT) || "mailto:support@example.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured on the server.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export { webpush };

// web-push's own WebPushError.toString()/String(error) just says
// "WebPushError: Received unexpected response code" - it drops the two
// things that actually matter for diagnosing which push service rejected
// it and why (statusCode, and the response body, which push services
// often use to explain the rejection). Used everywhere a route logs a
// send failure instead of the bare String(error) that made every non-
// 404/410 failure look identical and undiagnosable from the Diagnostics
// tab's "Run now" output.
export function describePushError(error: unknown): string {
  const err = error as { statusCode?: number; body?: string; message?: string };
  if (err?.statusCode) {
    const body = err.body ? ` — ${err.body.slice(0, 200)}` : "";
    return `HTTP ${err.statusCode}${body}`;
  }
  return err?.message ?? String(error);
}
