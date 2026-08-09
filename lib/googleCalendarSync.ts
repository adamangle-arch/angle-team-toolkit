import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listGoogleEvents,
  insertGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
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
  updated_at: string;
  created_at: string;
};

type Link = { event_id: string; connection_user_id: string; google_event_id: string; google_synced_at: string };

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

// The calendar this connection actually syncs against - a linked
// spouse's own literal user_id is never where shared events live (see
// profiles.household_id notes in schema.sql), so every query below has
// to go through this instead of connection.user_id directly.
async function getOwnerId(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from("profiles").select("household_id").eq("id", userId).maybeSingle();
  return (data as { household_id: string | null } | null)?.household_id ?? userId;
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
  deletedOnGoogle: number;
  errors: string[];
};

// The full bidirectional pass for one connected user - shared by the
// cron route (loops every connection) and the "Sync now" button (one
// connection, on demand). See the schema comment on
// calendar_event_google_links for why the mapping is per (event,
// connecting Google account) rather than a single column on
// calendar_events.
export async function syncOneConnection(admin: SupabaseClient, connection: Connection): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, deletedLocally: 0, deletedOnGoogle: 0, errors: [] };

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(admin, connection);
  } catch (err) {
    result.errors.push(`token refresh: ${String(err)}`);
    return result;
  }

  const ownerId = await getOwnerId(admin, connection.user_id);

  // --- Deletes queued locally since the last pass get pushed out first,
  // so an event deleted here never lingers on Google waiting for a
  // future update pass that will never come (it's gone, there's nothing
  // left to push an update from). ---
  const { data: pendingDeletes } = await admin
    .from("calendar_google_pending_deletes")
    .select("id,google_event_id")
    .eq("connection_user_id", connection.user_id);
  for (const pending of (pendingDeletes as { id: string; google_event_id: string }[]) ?? []) {
    try {
      await deleteGoogleEvent(accessToken, pending.google_event_id);
      await admin.from("calendar_google_pending_deletes").delete().eq("id", pending.id);
      result.deletedOnGoogle++;
    } catch (err) {
      result.errors.push(`delete ${pending.google_event_id}: ${String(err)}`);
    }
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
    const { data: linkRows } = await admin
      .from("calendar_event_google_links")
      .select("event_id,connection_user_id,google_event_id,google_synced_at")
      .eq("connection_user_id", connection.user_id);
    const linkByGoogleId = new Map(((linkRows as Link[]) ?? []).map((l) => [l.google_event_id, l]));

    const linkedEventIds = Array.from(linkByGoogleId.values()).map((l) => l.event_id);
    const { data: localRows } = linkedEventIds.length
      ? await admin
          .from("calendar_events")
          .select("id,title,notes,event_at,updated_at,created_at")
          .in("id", linkedEventIds)
      : { data: [] as LocalEvent[] };
    const localById = new Map(((localRows as LocalEvent[]) ?? []).map((r) => [r.id, r]));

    for (const event of listing.events) {
      // Recurring events (a series definition, or an expanded instance of
      // one) are excluded from v1 - calendar_events has nothing to map a
      // recurrence rule onto, and syncing every future instance of a
      // standing team meeting as its own row isn't what anyone wants here.
      if (event.recurrence || event.recurringEventId) continue;

      const link = linkByGoogleId.get(event.id);
      const local = link ? localById.get(link.event_id) : undefined;

      if (event.status === "cancelled") {
        if (local) {
          // Deletes the shared row outright, not just this connection's
          // link - see the trigger comment in schema.sql: that also
          // queues a delete for every OTHER connection's copy of the
          // same shared event (e.g. the other spouse's own Google
          // Calendar), which is what "delete on one side removes it
          // everywhere" actually requires.
          await admin.from("calendar_events").delete().eq("id", local.id);
          result.deletedLocally++;
        }
        continue;
      }

      const fields = googleEventToLocalFields(event);
      if (!fields) continue;

      if (!local) {
        const { data: inserted, error } = await admin
          .from("calendar_events")
          .insert({
            user_id: ownerId,
            creator_id: connection.user_id,
            title: fields.title,
            notes: fields.notes,
            event_at: fields.eventAt,
            scope: "private",
            reminder_minutes_before: null,
          })
          .select("id")
          .single();
        if (error || !inserted) {
          result.errors.push(`insert ${event.id}: ${error?.message ?? "unknown error"}`);
          continue;
        }
        const { error: linkError } = await admin.from("calendar_event_google_links").insert({
          event_id: inserted.id,
          connection_user_id: connection.user_id,
          google_event_id: event.id,
          google_synced_at: new Date().toISOString(),
        });
        if (linkError) result.errors.push(`link ${event.id}: ${linkError.message}`);
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
          .update({ title: fields.title, notes: fields.notes, event_at: fields.eventAt })
          .eq("id", local.id);
        if (error) {
          result.errors.push(`update ${event.id}: ${error.message}`);
        } else {
          await admin
            .from("calendar_event_google_links")
            .update({ google_synced_at: new Date().toISOString() })
            .eq("event_id", local.id)
            .eq("connection_user_id", connection.user_id);
          result.pulled++;
        }
      }
    }

    await admin
      .from("google_calendar_connections")
      .update({ sync_token: listing.nextSyncToken, last_synced_at: new Date().toISOString() })
      .eq("user_id", connection.user_id);
  }

  // --- Outbound: push local changes this connection's Google account
  // doesn't have yet. Every event the household can see gets pushed -
  // no "only if created after connecting" gate, since that made a
  // pre-existing event silently and permanently un-syncable with no way
  // for anyone to notice or fix it short of re-creating the event. ---
  const { data: outboundRows } = await admin
    .from("calendar_events")
    .select("id,title,notes,event_at,updated_at,created_at")
    .eq("user_id", ownerId);
  const { data: ownLinkRows } = await admin
    .from("calendar_event_google_links")
    .select("event_id,google_event_id,google_synced_at")
    .eq("connection_user_id", connection.user_id);
  const ownLinkByEventId = new Map(
    ((ownLinkRows as { event_id: string; google_event_id: string; google_synced_at: string }[]) ?? []).map((l) => [
      l.event_id,
      l,
    ])
  );

  for (const row of (outboundRows as LocalEvent[]) ?? []) {
    const link = ownLinkByEventId.get(row.id);
    const changedSinceLastPush = link && new Date(row.updated_at).getTime() > new Date(link.google_synced_at).getTime();

    try {
      if (!link) {
        const created = await insertGoogleEvent(accessToken, row.title, row.notes, row.event_at);
        const { error } = await admin.from("calendar_event_google_links").insert({
          event_id: row.id,
          connection_user_id: connection.user_id,
          google_event_id: created.id,
          google_synced_at: new Date().toISOString(),
        });
        if (error) result.errors.push(`link ${row.id}: ${error.message}`);
        else result.pushed++;
      } else if (changedSinceLastPush) {
        await updateGoogleEvent(accessToken, link.google_event_id, row.title, row.notes, row.event_at);
        await admin
          .from("calendar_event_google_links")
          .update({ google_synced_at: new Date().toISOString() })
          .eq("event_id", row.id)
          .eq("connection_user_id", connection.user_id);
        result.pushed++;
      }
    } catch (err) {
      result.errors.push(`push ${row.id}: ${String(err)}`);
    }
  }

  return result;
}
