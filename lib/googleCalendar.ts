// Thin wrapper around Google's OAuth + Calendar v3 REST endpoints - no
// Google SDK dependency, just fetch, matching how the rest of this app's
// server routes talk to external services (web-push, Anthropic).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

// Narrowest scope that can read/write events without also granting
// calendar-settings/sharing access this app has no use for. "openid
// email" is just so the OAuth callback can label the connection with
// which Google account it is, for the Calendar page's status line.
const SCOPES = "https://www.googleapis.com/auth/calendar.events openid email";

export function ensureGoogleConfigured() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google Calendar sync is not configured on the server.");
  }
}

export function buildAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    // Forces Google to hand back a refresh_token even if this account
    // already granted consent before (e.g. reconnecting after a
    // disconnect) - without this, a repeat consent can silently omit it.
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  return res.json();
}

export async function revokeToken(token: string): Promise<void> {
  // Best-effort - a failed revoke shouldn't block disconnecting locally,
  // the row just stops being written to either way.
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // Ignored - see above.
  }
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

export type GoogleEvent = {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  updated: string;
  recurringEventId?: string;
  recurrence?: string[];
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
};

type ListResult = { events: GoogleEvent[]; nextSyncToken: string | null; syncTokenInvalid?: boolean };

// Handles pagination itself - only the final page carries nextSyncToken,
// so a caller working page-by-page would have to know that; this always
// hands back the complete set plus the one cursor that matters for next
// time. A syncToken Google no longer recognizes (410 Gone - typically
// after long inactivity) is reported back via syncTokenInvalid rather
// than thrown, since the caller's recovery (drop the token, do one bounded
// full resync) is expected, not exceptional.
export async function listGoogleEvents(
  accessToken: string,
  syncToken: string | null
): Promise<ListResult> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const params = new URLSearchParams({ singleEvents: "true", maxResults: "250" });
    if (syncToken) {
      params.set("syncToken", syncToken);
    } else {
      // First-ever sync (or recovering from an invalidated token) - bound
      // to the last week forward rather than a full account history dump.
      const timeMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      params.set("timeMin", timeMin);
      params.set("showDeleted", "false");
    }
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${CALENDAR_EVENTS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 410) {
      return { events: [], nextSyncToken: null, syncTokenInvalid: true };
    }
    if (!res.ok) throw new Error(`Google events.list failed: ${await res.text()}`);
    const data = (await res.json()) as {
      items: GoogleEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    events.push(...data.items);
    pageToken = data.nextPageToken;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}

type EventPayload = {
  summary: string;
  description: string;
  start: { dateTime: string };
  end: { dateTime: string };
};

function toEventPayload(title: string, notes: string, eventAt: string): EventPayload {
  // calendar_events has no separate end time - every event on this app's
  // own Calendar page is a point in time, not a duration, so a fixed
  // 30-minute block is the closest honest mapping into Google's
  // start/end-required event shape.
  const start = new Date(eventAt);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    summary: title,
    description: notes,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

export async function insertGoogleEvent(
  accessToken: string,
  title: string,
  notes: string,
  eventAt: string
): Promise<GoogleEvent> {
  const res = await fetch(CALENDAR_EVENTS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(toEventPayload(title, notes, eventAt)),
  });
  if (!res.ok) throw new Error(`Google events.insert failed: ${await res.text()}`);
  return res.json();
}

export async function updateGoogleEvent(
  accessToken: string,
  googleEventId: string,
  title: string,
  notes: string,
  eventAt: string
): Promise<GoogleEvent> {
  const res = await fetch(`${CALENDAR_EVENTS_URL}/${encodeURIComponent(googleEventId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(toEventPayload(title, notes, eventAt)),
  });
  if (!res.ok) throw new Error(`Google events.update failed: ${await res.text()}`);
  return res.json();
}
