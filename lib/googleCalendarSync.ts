import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listGoogleEvents,
  insertGoogleEvent,
  updateGoogleEvent,
  refreshAccessToken,
  type GoogleEvent,
} from "./googleCalendar";

type Connection = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  sync_token: string | null;
  created_at: string;
};

type LocalEvent = {
  id: string;
  title: string;
  notes: string;
  event_at: string;
  google_event_id: string | null;
  google_synced_at: string | null;
  updated_at: string;
  created_at: string;
};

// Refreshes and persists a new access token if the stored one is at or
// past expiry (a minute of slack so a token that's about to expire mid-
// request doesn't get used right up to the wire) - every call site below
// goes through this instead of trusting token_expires_at is still good.
async function getValidAccessToken(admin: SupabaseClient, connection: Connection): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return connection.access_token;
  }
  const refreshed = await refreshAccessToken(connection.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await admin
    .from("google_calendar_connections")
    .update({ access_token: refreshed.access_token, token_expires_at: newExpiresAt })
    .eq("user_id", connection.user_id);
  return refreshed.access_token;
}

function googleEventToLocalFields(event: GoogleEvent): { title: string; notes: string; eventAt: string } | null {
  const startIso = event.start?.dateTime ?? (event.start?.date ? `${event.start.date}T00:00:00Z` : null);
  if (!startIso) return null;
  return {
    title: event.summary || "(No title)",
    notes: event.description ?? "",
    eventAt: new Date(startIso).toISOString(),
  };
}

export type SyncResult = {
  pulled: number;
  pushed: number;
  deletedLocally: number;
  errors: string[];
};

// The full bidirectional pass for one connected user - shared by the
// cron route (loops every connection) and the "Sync now" button (one
// connection, on demand). See the schema comment on google_synced_at for
// why outbound and inbound each compare against different timestamps
// rather than both racing off updated_at.
export async function syncOneConnection(admin: SupabaseClient, connection: Connection): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, deletedLocally: 0, errors: [] };

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(admin, connection);
  } catch (err) {
    result.errors.push(`token refresh: ${String(err)}`);
    return result;
  }

  // --- Inbound: pull whatever Google says changed since last time ---
  let syncToken = connection.sync_token;
  let listing = await listGoogleEvents(accessToken, syncToken).catch((err) => {
    result.errors.push(`events.list: ${String(err)}`);
    return null;
  });
  if (listing?.syncTokenInvalid) {
    // Google no longer recognizes our cursor (typically after weeks of no
    // sync) - drop it and fall back to one bounded resync instead of
    // treating this as a hard failure.
    syncToken = null;
    listing = await listGoogleEvents(accessToken, null).catch((err) => {
      result.errors.push(`events.list (resync): ${String(err)}`);
      return null;
    });
  }

  if (listing) {
    const { data: localRows } = await admin
      .from("calendar_events")
      .select("id,title,notes,event_at,google_event_id,google_synced_at,updated_at,created_at")
      .eq("user_id", connection.user_id)
      .not("google_event_id", "is", null);
    const localByGoogleId = new Map(
      ((localRows as LocalEvent[]) ?? []).map((r) => [r.google_event_id as string, r])
    );

    for (const event of listing.events) {
      // Recurring events (a series definition, or an expanded instance of
      // one) are excluded from v1 - calendar_events has nothing to map a
      // recurrence rule onto, and syncing every future instance of a
      // standing team meeting as its own row isn't what anyone wants here.
      if (event.recurrence || event.recurringEventId) continue;

      const local = localByGoogleId.get(event.id);

      if (event.status === "cancelled") {
        if (local) {
          await admin.from("calendar_events").delete().eq("id", local.id);
          result.deletedLocally++;
        }
        continue;
      }

      const fields = googleEventToLocalFields(event);
      if (!fields) continue;

      if (!local) {
        const { error } = await admin.from("calendar_events").insert({
          user_id: connection.user_id,
          creator_id: connection.user_id,
          title: fields.title,
          notes: fields.notes,
          event_at: fields.eventAt,
          scope: "private",
          reminder_minutes_before: null,
          google_event_id: event.id,
          google_synced_at: new Date().toISOString(),
        });
        if (error) result.errors.push(`insert ${event.id}: ${error.message}`);
        else result.pulled++;
        continue;
      }

      // Last-write-wins: only overwrite the local copy if Google's edit
      // is newer than whatever's on our side - a concurrent local edit
      // that's actually the more recent one gets pushed back out on the
      // outbound pass below instead of being clobbered here.
      if (new Date(event.updated).getTime() > new Date(local.updated_at).getTime()) {
        const { error } = await admin
          .from("calendar_events")
          .update({
            title: fields.title,
            notes: fields.notes,
            event_at: fields.eventAt,
            google_synced_at: new Date().toISOString(),
          })
          .eq("id", local.id);
        if (error) result.errors.push(`update ${event.id}: ${error.message}`);
        else result.pulled++;
      }
    }

    await admin
      .from("google_calendar_connections")
      .update({ sync_token: listing.nextSyncToken, last_synced_at: new Date().toISOString() })
      .eq("user_id", connection.user_id);
  }

  // --- Outbound: push local changes Google doesn't have yet ---
  const { data: outboundRows } = await admin
    .from("calendar_events")
    .select("id,title,notes,event_at,google_event_id,google_synced_at,updated_at,created_at")
    .eq("user_id", connection.user_id);

  for (const row of (outboundRows as LocalEvent[]) ?? []) {
    const neverLinked = !row.google_event_id;
    // A never-linked row only gets pushed if it was created after this
    // account connected Google Calendar - otherwise connecting for the
    // first time would dump someone's entire event history into their
    // Google Calendar in one shot, which nobody asked for.
    const createdAfterConnecting = new Date(row.created_at).getTime() > new Date(connection.created_at).getTime();
    const changedSinceLastPush =
      row.google_synced_at && new Date(row.updated_at).getTime() > new Date(row.google_synced_at).getTime();

    try {
      if (neverLinked && createdAfterConnecting) {
        const created = await insertGoogleEvent(accessToken, row.title, row.notes, row.event_at);
        await admin
          .from("calendar_events")
          .update({ google_event_id: created.id, google_synced_at: new Date().toISOString() })
          .eq("id", row.id);
        result.pushed++;
      } else if (row.google_event_id && changedSinceLastPush) {
        await updateGoogleEvent(accessToken, row.google_event_id, row.title, row.notes, row.event_at);
        await admin
          .from("calendar_events")
          .update({ google_synced_at: new Date().toISOString() })
          .eq("id", row.id);
        result.pushed++;
      }
    } catch (err) {
      result.errors.push(`push ${row.id}: ${String(err)}`);
    }
  }

  return result;
}
