export interface ParsedVideo {
  videoId: string | null;
  /** Set when the link carried a `list=` param or was a /playlist URL. */
  playlistId: string | null;
  /** Seconds from a ?t= / ?start= parameter, if the URL carried one. */
  startSeconds: number | null;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
/** Playlist ids vary in length by kind (PL.../UU.../RD...), so this only rules out garbage. */
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{10,64}$/;

/** "1h2m3s" | "90s" | "90" -> seconds */
function parseTimeParam(raw: string | null): number | null {
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match[0]) return null;
  const [, h, m, s] = match;
  const total = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  return total > 0 ? total : null;
}

/**
 * Accepts a bare video id, a playlist link, or any of the URL shapes YouTube
 * hands out: watch?v=, youtu.be/, /embed/, /shorts/, /live/, /playlist?list=.
 * A watch URL can carry both a video id and a list id (a video opened from
 * inside a playlist) — both are returned.
 */
export function parseYouTubeUrl(input: string): ParsedVideo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (ID_PATTERN.test(trimmed)) return { videoId: trimmed, playlistId: null, startSeconds: null };

  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  let videoId: string | null = null;
  const playlistId: string | null = url.searchParams.get("list");

  if (host === "youtu.be") {
    videoId = url.pathname.slice(1).split("/")[0] ?? null;
  } else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "watch") videoId = url.searchParams.get("v");
    else if (segments[0] === "playlist") videoId = null;
    else if (["embed", "shorts", "live", "v"].includes(segments[0] ?? "")) {
      // /embed/videoseries?list=... is how YouTube represents "embed this whole playlist".
      videoId = segments[1] === "videoseries" ? null : segments[1] ?? null;
    }
  } else {
    return null;
  }

  const validVideoId = videoId && ID_PATTERN.test(videoId) ? videoId : null;
  const validPlaylistId = playlistId && PLAYLIST_ID_PATTERN.test(playlistId) ? playlistId : null;
  if (!validVideoId && !validPlaylistId) return null;

  const startSeconds =
    parseTimeParam(url.searchParams.get("t")) ?? parseTimeParam(url.searchParams.get("start"));

  return { videoId: validVideoId, playlistId: validPlaylistId, startSeconds };
}
