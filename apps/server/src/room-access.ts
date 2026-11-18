/**
 * Join/reclaim credentials (C4, K2.1): a password or an invite key, never both.
 * Both share one 10-strike lockout and return the same null (→ 401) for an
 * unknown room, a locked room or a wrong secret. Secrets are never logged.
 */
import { LOCKOUT_FAILED_ATTEMPTS, LOCKOUT_MS } from "@cd/protocol";
import { hashToken, inviteKeyEquals, newSeatId, verifyPassword } from "./crypto";
import type { RoomMeta, RoomStore, SeatRecord } from "./room-store";

export type Credential = { password: string } | { invite: string };

/** Builds a Credential from a validated body (the schema guarantees exactly one). */
export function credentialOf(body: { password?: string; invite?: string }): Credential {
  return body.invite !== undefined ? { invite: body.invite } : { password: body.password ?? "" };
}

/** Fixed salt for the dummy PBKDF2 run that equalizes failure timing (never matches). */
const DUMMY_SALT_B64 = "AAAAAAAAAAAAAAAAAAAAAA==";

export interface AccessDeps {
  store: RoomStore;
  now(): number;
  iterations(): number;
  /** Called after the lockout trips (the host's view shows it). */
  onLocked(meta: RoomMeta): Promise<void>;
}

async function matches(cred: Credential, meta: RoomMeta): Promise<boolean> {
  if ("invite" in cred) return inviteKeyEquals(cred.invite, meta.inviteKey ?? "");
  return verifyPassword(cred.password, meta.pwd);
}

/** Same work as a real check, so failures are indistinguishable by timing. */
async function dummy(cred: Credential, meta: RoomMeta | undefined, d: AccessDeps): Promise<void> {
  if ("invite" in cred) {
    await inviteKeyEquals(cred.invite, "");
    return;
  }
  const iterations = meta?.pwd.iterations ?? d.iterations();
  await verifyPassword(cred.password, { saltB64: DUMMY_SALT_B64, hashB64: "", iterations });
}

/**
 * C4 order: no meta / lockout / wrong secret → null (caller sends 401).
 * Wrong secrets of either kind count toward the lockout; success resets it.
 */
export async function checkCredentials(d: AccessDeps, cred: Credential): Promise<RoomMeta | null> {
  const meta = await d.store.getMeta();
  const now = d.now();
  const locked = meta?.joinLockedUntil != null && now < meta.joinLockedUntil;
  if (!meta || locked) {
    await dummy(cred, meta, d);
    return null;
  }
  if (!(await matches(cred, meta))) {
    meta.failedJoins += 1;
    if (meta.failedJoins >= LOCKOUT_FAILED_ATTEMPTS) {
      meta.joinLockedUntil = now + LOCKOUT_MS;
      meta.failedJoins = 0;
      // Clients drop views whose version is not strictly higher, so bump it for this event
      // (lastActivityAt untouched: a lockout is not activity).
      meta.version += 1;
      await d.store.putMetaQuiet(meta);
      await d.onLocked(meta);
    } else {
      await d.store.putMetaQuiet(meta);
    }
    return null;
  }
  if (meta.failedJoins !== 0 || meta.joinLockedUntil !== null) {
    meta.failedJoins = 0;
    meta.joinLockedUntil = null;
    await d.store.putMetaQuiet(meta);
  }
  return meta;
}

/** A fresh seat; only the token's SHA-256 is stored. */
export async function newSeat(
  name: string,
  joinOrder: number,
  host: boolean,
  token: string,
  now: number,
): Promise<SeatRecord> {
  return {
    seatId: newSeatId(),
    name,
    joinOrder,
    host,
    seatIndex: null,
    tokenHash: await hashToken(token),
    away: false,
    lastSeenAt: now,
  };
}
