import type { Metadata } from "next";

// A title of its own, so the popup is never mistaken for the main tab in Chrome's share picker.
export const metadata: Metadata = { title: "KeyTube 엔진" };

export default function EngineLayout({ children }: LayoutProps<"/engine">) {
  return children;
}
