"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@/lib/types";

type Ctx = {
  session: Session | null;
  ready: boolean;
  signIn: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/session")
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as Session;
      })
      .then((next) => setSession(next))
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      session,
      ready,
      signIn: async (userId) => {
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        if (!res.ok) throw new Error("Could not sign in.");
        setSession((await res.json()) as Session);
      },
      signOut: async () => {
        await fetch("/api/session", { method: "DELETE" });
        setSession(null);
      },
    }),
    [ready, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

export function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}
