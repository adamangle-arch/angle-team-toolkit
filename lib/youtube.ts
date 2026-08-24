// Pulls the 11-character video ID out of any common YouTube URL shape
// someone might paste (watch?v=, youtu.be/, embed/, shorts/), ignoring
// any trailing query params (&t=10s, etc.) - returns null for anything
// that isn't recognizably a YouTube link, so callers can reject/skip it
// rather than embedding a broken player.
export function extractYoutubeId(url: string): string | null {
  const trimmed = url.trim();
  const match = trimmed.match(
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}
