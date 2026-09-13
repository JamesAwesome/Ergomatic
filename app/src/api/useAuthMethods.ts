import { useEffect, useState } from "react";
import type { AuthMethods } from "../../shared/auth";
import { api } from "../api";

type AuthMethodsState =
  | { state: "loading" }
  | { state: "ready"; methods: AuthMethods }
  | { state: "error" };

function isAuthMethods(value: unknown): value is AuthMethods {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.apple === "boolean" && typeof record.google === "boolean"
  );
}

export function useAuthMethods(refreshKey: string): AuthMethodsState {
  const [state, setState] = useState<AuthMethodsState>({ state: "loading" });
  useEffect(() => {
    let live = true;
    void api("/api/auth/methods")
      .then(async (response) => {
        if (!response.ok) throw new Error("methods unavailable");
        const body: unknown = await response.json();
        if (!isAuthMethods(body)) throw new Error("invalid methods response");
        if (live) setState({ state: "ready", methods: body });
      })
      .catch(() => {
        if (live) setState({ state: "error" });
      });
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return state;
}
