import type { Metadata, Viewport } from "next";
import { requirePage } from "@/lib/auth";
import { showState } from "@/lib/meeting";
import { dbConfigured } from "@/lib/supabase";
import { TvView } from "./tv-view";

export const metadata: Metadata = { title: "TV" };
export const viewport: Viewport = { themeColor: "#0b0d12" };
export const dynamic = "force-dynamic";

/** The office TV: signed in once with the team password, it waits for the show and follows it. */
export default async function TvPage() {
  const role = await requirePage();
  const initial = dbConfigured() ? await showState(null).catch(() => null) : null;
  return <TvView initial={initial} canControl={role === "owner"} />;
}
