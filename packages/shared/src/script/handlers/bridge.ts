import type { Handler } from "../runner.ts";

/** Commands whose logic belongs to later specs: special marts (FR-006). The PC goes through a command not named yet; it shows up in the missing log. */
export const BRIDGED = [
  "DecorationMart",
  "SealMart",
] as const;

const bridge: Handler = (c) => {
  if (!c.host.bridge(c.name, c.args)) c.unsupported();
};

export const BRIDGE: Record<string, Handler> = Object.fromEntries(BRIDGED.map((name) => [name, bridge]));
