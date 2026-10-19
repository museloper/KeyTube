export interface VideoMeta {
  title: string;
  author: string;
  thumbnail: string;
}

/**
 * oEmbed gives us the title and thumbnail without an API key and without
 * spending Data API quota (a v3 search costs 100 units against a 10k/day cap).
 */
export async function fetchVideoMeta(videoId: string): Promise<VideoMeta | null> {
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  endpoint.searchParams.set("format", "json");

  try {
    const res = await fetch(endpoint, { cache: "force-cache" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return {
      title: data.title ?? "제목 없음",
      author: data.author_name ?? "",
      thumbnail: data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return null;
  }
}
