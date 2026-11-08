import type { ClientMessage, ServerMessage } from "@soulsilver/shared/game";
import { depositItem, moveMon, renameBox, withdrawItem } from "@soulsilver/shared/pc";
import type { PocketOf } from "@soulsilver/shared/items";
import type { Save } from "@soulsilver/shared/save";

// The Pokémon PC (spec 023): one open PC per player, opened by the PC's script, which waits until
// the player logs off. Every move is checked in shared/pc; a refusal changes nothing.

export interface PcUser {
  playerId: number;
  progress: Pick<Save, "party" | "boxes" | "bag" | "pcItems">;
  send(msg: ServerMessage): void;
}

export interface PcsOptions {
  /** After a change to the party or the bag, so the client gets it again. */
  changed(playerId: number, what: "party" | "bag"): void;
  /** The player logged off: the waiting script goes on. */
  onClose(playerId: number): void;
  /** Spec 027: the pocket of an item, so a withdrawal keeps the bag's limits. */
  pocketOf?: PocketOf | undefined;
}

type PcRequest = Extract<ClientMessage, { type: "pc-move" | "pc-rename" | "pc-items" | "pc-leave" }>;

export interface Pcs {
  join(who: PcUser): void;
  leave(playerId: number): void;
  open(playerId: number): boolean;
  handle(playerId: number, msg: PcRequest): void;
}

function apply(u: PcUser, msg: Exclude<PcRequest, { type: "pc-leave" }>, pocketOf?: PocketOf) {
  if (msg.type === "pc-move") return moveMon(u.progress, msg.from, msg.to);
  if (msg.type === "pc-rename") return renameBox(u.progress.boxes, msg.box, msg.name);
  // An addition: HGSS PCs keep no items (docs/balance-log.md).
  return msg.dir === "deposit" ? depositItem(u.progress, msg.item, msg.qty) : withdrawItem(u.progress, msg.item, msg.qty, pocketOf);
}

export function createPcs(options: PcsOptions): Pcs {
  const who = new Map<number, PcUser>();
  const open = new Set<number>();

  return {
    join: (u) => void who.set(u.playerId, u),
    leave(playerId) {
      who.delete(playerId);
      open.delete(playerId);
    },
    open(playerId) {
      const u = who.get(playerId);
      if (!u) return false;
      open.add(playerId);
      u.send({ type: "pcOpen", boxes: u.progress.boxes, pcItems: u.progress.pcItems });
      return true;
    },
    handle(playerId, msg) {
      const u = who.get(playerId);
      if (!u) return;
      if (msg.type === "pc-leave" && open.delete(playerId)) {
        u.send({ type: "pcClose" });
        options.onClose(playerId);
        return;
      }
      const reason = !open.has(playerId) || msg.type === "pc-leave" ? "invalid" : apply(u, msg, options.pocketOf);
      u.send({ type: "pcResult", ok: reason === null, ...(reason === null ? {} : { reason }), boxes: u.progress.boxes, pcItems: u.progress.pcItems });
      if (reason === null && msg.type === "pc-move") options.changed(playerId, "party");
      if (reason === null && msg.type === "pc-items") options.changed(playerId, "bag");
    },
  };
}
