import { describe, expect, it } from "vitest";
import { parseYouTubeUrl } from "./parseUrl";

describe("parseYouTubeUrl", () => {
  it("reads a standard watch URL", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      videoId: "dQw4w9WgXcQ",
      playlistId: null,
      startSeconds: null,
    });
  });

  it("keeps both ids when a video is opened from inside a playlist", () => {
    const parsed = parseYouTubeUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf&index=2",
    );
    expect(parsed?.videoId).toBe("dQw4w9WgXcQ");
    expect(parsed?.playlistId).toBe("PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf");
  });

  it("reads a bare playlist URL with no video id", () => {
    const parsed = parseYouTubeUrl("https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf");
    expect(parsed).toEqual({
      videoId: null,
      playlistId: "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
      startSeconds: null,
    });
  });

  it("reads a playlist embed URL (/embed/videoseries)", () => {
    const parsed = parseYouTubeUrl(
      "https://www.youtube.com/embed/videoseries?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
    );
    expect(parsed?.videoId).toBeNull();
    expect(parsed?.playlistId).toBe("PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf");
  });

  it("rejects a garbage list param on a non-YouTube host", () => {
    expect(parseYouTubeUrl("https://vimeo.com/12345?list=whatever")).toBeNull();
  });

  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", "short link"],
    ["youtube.com/embed/dQw4w9WgXcQ", "embed path"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "shorts"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "live"],
    ["dQw4w9WgXcQ", "bare id"],
  ])("accepts %s (%s)", (input) => {
    expect(parseYouTubeUrl(input)?.videoId).toBe("dQw4w9WgXcQ");
  });

  it("picks up a plain second count", () => {
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=90")?.startSeconds).toBe(90);
  });

  it("picks up an h/m/s timestamp", () => {
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=1h2m3s")?.startSeconds).toBe(3723);
  });

  it("falls back to the start parameter", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=42")?.startSeconds).toBe(42);
  });

  it.each([
    ["https://vimeo.com/12345", "another host"],
    ["https://youtu.be/abc", "an id of the wrong length"],
    ["   ", "blank input"],
    ["not a url at all !!", "garbage"],
  ])("rejects %s (%s)", (input) => {
    expect(parseYouTubeUrl(input)).toBeNull();
  });
});
