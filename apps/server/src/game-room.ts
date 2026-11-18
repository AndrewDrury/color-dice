import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { error } from "./http";

/** Stub: a later task replaces this with the real implementation. */
export class GameRoom extends DurableObject<Env> {
  override async fetch(_request: Request): Promise<Response> {
    return error("E_NOT_IMPLEMENTED", 501);
  }
}
