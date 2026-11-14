import type { ReactNode } from "react";
import { requirePage } from "@/lib/auth";
import { dbConfigured } from "@/lib/supabase";
import { NavBar, TabBar } from "@/components/nav-bar";
import { Toaster } from "@/components/toaster";
import { Notice } from "@/components/ui";

/** The owner's screens. The team password only opens the TV (/tv): anyone else is sent there. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const role = await requirePage("owner");
  return (
    <>
      <NavBar role={role} />
      {/* Room at the bottom for the floating tab bar on phones (it publishes --tabbar-h). */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-2" style={{ paddingBottom: "calc(var(--tabbar-h, 0px) + 2rem)" }}>
        {!dbConfigured() && (
          <div className="mb-4">
            <Notice tone="amber">The database isn&apos;t connected yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel (SETUP.md).</Notice>
          </div>
        )}
        {children}
      </main>
      <TabBar />
      <Toaster />
    </>
  );
}
