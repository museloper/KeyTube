/**
 * URLs opened or fetched at runtime rather than imported, so Next.js can't
 * add basePath to them — it has to be prefixed by hand.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Copied into public/ by scripts/copy-vendor.mjs. */
export const STRETCH_MODULE_URL = `${BASE}/vendor/signalsmith-stretch.mjs`;

export const ENGINE_PAGE_URL = `${BASE}/engine`;
