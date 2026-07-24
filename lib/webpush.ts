import webpush from "web-push";

let configured = false;

// Call before every send — cheap idempotent check, avoids configuring with
// empty strings if env vars aren't set yet during build/import time.
export function ensureWebPushConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@example.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured on the server.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export { webpush };
