import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static — this app has no API routes, server actions, or dynamic
  // route params, so it can be hosted on GitHub Pages (or any static host)
  // without a Node.js server. See docs/PLAN.md and CLAUDE.md.
  output: "export",
  // Left undefined for local dev and non-Pages hosts (Vercel, etc.), where
  // the site is served from "/". The GitHub Actions workflow sets this from
  // actions/configure-pages, which detects the right value (a "/<repo>"
  // subpath, or "" for a custom domain / user site) automatically — do not
  // hard-code a repo name here.
  basePath: process.env.PAGES_BASE_PATH,
  // Static export has no server to run the Image Optimization API, and
  // playlist thumbnails come from i.ytimg.com (an external, unpredictable
  // set of video ids) so a custom loader isn't worth it — serve as-is.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
