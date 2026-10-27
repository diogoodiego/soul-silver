// Public API of @soulsilver/shared/script (spec 020).
import { BRIDGE } from "./handlers/bridge.ts";
import { FLAGS } from "./handlers/flags.ts";
import { FLOW } from "./handlers/flow.ts";
import { ITEMS } from "./handlers/items.ts";
import { MESSAGE } from "./handlers/message.ts";
import { POKEMON } from "./handlers/pokemon.ts";
import { WORLD } from "./handlers/world.ts";
import type { Handler } from "./runner.ts";

export * from "./host.ts";
export * from "./runner.ts";
export { BRIDGED } from "./handlers/bridge.ts";

/** Every command the interpreter knows, by the name the extractor gives it. */
export const SCRIPT_HANDLERS: ReadonlyMap<string, Handler> = new Map(Object.entries({ ...FLOW, ...FLAGS, ...MESSAGE, ...ITEMS, ...POKEMON, ...WORLD, ...BRIDGE }));
