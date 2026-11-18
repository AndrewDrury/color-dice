/**
 * Invite link (K2.1). The key lives in the URL fragment only: never sent to a server by the
 * browser, never put in localStorage, never logged. This module keeps it in memory for the
 * current tab so the "Copy invite link" button can build the link.
 */
import { GameCodeSchema, InviteKeySchema, type InviteRes } from "@cd/protocol";
import { useCallback, useEffect, useState } from "preact/hooks";
import { getInvite, resetInvite } from "./api";

const FRAGMENT = /^#\/join\/([^/]+)\/([^/]+)$/;

/** Read `#/join/<CODE>/<key>`. Null unless both parts are well-formed. */
export function parseInviteHash(hash: string): { code: string; key: string } | null {
  const m = FRAGMENT.exec(hash);
  if (!m) return null;
  const code = (m[1] ?? "").toUpperCase();
  const key = m[2] ?? "";
  if (!GameCodeSchema.safeParse(code).success || !InviteKeySchema.safeParse(key).success) {
    return null;
  }
  return { code, key };
}

/** True for any `#/join/…` fragment (valid or not): it is always stripped from the URL. */
export function isInviteHash(hash: string): boolean {
  return hash.startsWith("#/join/");
}

/** `https://host/<base>/#/join/<CODE>/<key>` */
export function inviteLink(code: string, key: string): string {
  return `${globalThis.location.origin}${import.meta.env.BASE_URL}#/join/${encodeURIComponent(code)}/${encodeURIComponent(key)}`;
}

const keys = new Map<string, string>();
const listeners = new Set<() => void>();

/** Remember a key (from create / GET invite / reset) in memory only. */
export function primeInvite(code: string, key: string): void {
  if (keys.get(code) === key) return;
  keys.set(code, key);
  for (const cb of listeners) cb();
}

/** Forget a key (password change rotates it, or the room is gone). */
export function dropInvite(code: string): void {
  if (keys.delete(code)) for (const cb of listeners) cb();
}

export async function refreshInvite(code: string, token: string): Promise<InviteRes | null> {
  try {
    const res = await getInvite(code, token);
    primeInvite(code, res.inviteKey);
    return res;
  } catch {
    return null;
  }
}

export async function resetInviteKey(code: string, token: string): Promise<void> {
  const res = await resetInvite(code, token);
  primeInvite(code, res.inviteKey);
}

/** Current invite link for the room, or null while it loads. */
export function useInviteLink(code: string, token: string): string | null {
  const [, bump] = useState(0);
  useEffect(() => {
    const cb = () => bump((n) => n + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  const key = keys.get(code);
  const load = useCallback(() => {
    void refreshInvite(code, token);
  }, [code, token]);
  useEffect(() => {
    if (!keys.has(code)) load();
  }, [code, load, key]);
  return key ? inviteLink(code, key) : null;
}

/** Test helper. */
export function _resetInviteForTests(): void {
  keys.clear();
  listeners.clear();
}
