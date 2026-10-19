// Copies runtime-only modules into public/ so they are served untouched.
// signalsmith-stretch stringifies its own source into an AudioWorklet; any
// bundler rewrite (Turbopack's `process` polyfill, for one) references names
// that don't exist inside the worklet and the node never reports ready.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/vendor", { recursive: true });
copyFileSync("node_modules/signalsmith-stretch/SignalsmithStretch.mjs", "public/vendor/signalsmith-stretch.mjs");
