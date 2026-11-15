import type { MetadataRoute } from "next";

/** Makes "Add to Home Screen" open Meetings as its own app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Meetings by TKG",
    short_name: "Meetings",
    description: "Your team meeting, from a voice note in the car to the office TV.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    lang: "en",
    categories: ["business", "productivity"],
    background_color: "#f2f3f7",
    theme_color: "#f2f3f7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
