const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// The video id from any common YouTube link: youtu.be/<id>, watch?v=<id>
// (extra params such as &list= are ignored), /embed/<id>, /shorts/<id> or
// /live/<id>. Null for anything that isn't a YouTube video link, so
// callers can fall back to treating it as an ordinary URL.
export function youTubeIdFromUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (YOUTUBE_HOSTS.has(host)) {
    id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ?? null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}
