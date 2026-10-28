import type { PcRefusal, PcSlot } from "../game/protocol.ts";
import { BOX_NAME_MAX, BOX_SLOTS, type PartyMember, type Save } from "../save/schema.ts";

// PC boxes (spec 023, data-model.md): each operation checks everything before it changes anything.

export type PcProgress = Pick<Save, "party" | "boxes">;
type Boxes = Save["boxes"];

export function firstFree(boxes: Boxes): { box: number; index: number } | undefined {
  for (let box = 0; box < boxes.length; box++) {
    const index = boxes[box]!.slots.indexOf(null);
    if (index >= 0) return { box, index };
  }
  return undefined;
}

/** Puts a Pokémon in the first free slot; false when every box is full. */
export function store(boxes: Boxes, member: PartyMember): boolean {
  const at = firstFree(boxes);
  if (!at) return false;
  boxes[at.box]!.slots[at.index] = member;
  return true;
}

const inBox = (boxes: Boxes, s: PcSlot) => s.where === "box" && s.box >= 0 && s.box < boxes.length && s.index >= 0 && s.index < BOX_SLOTS;

/** Moves one Pokémon; null when done. A move into the party appends it, so the target index must be the party's end. */
export function moveMon(p: PcProgress, from: PcSlot, to: PcSlot): PcRefusal | null {
  if ((from.where === "box" && !inBox(p.boxes, from)) || (to.where === "box" && !inBox(p.boxes, to))) return "invalid";
  if (from.where === to.where && from.index === to.index && (from.where === "party" || (to.where === "box" && from.box === to.box))) return "invalid";
  const mon = from.where === "party" ? p.party[from.index] : p.boxes[from.box]!.slots[from.index];
  if (!mon) return "empty";
  if (to.where === "party") {
    if (from.where === "party") return "invalid"; // reordering the party is the party menu's job
    if (p.party.length >= 6) return "full";
    if (to.index < p.party.length) return "occupied";
  } else if (p.boxes[to.box]!.slots[to.index]) return "occupied";
  if (from.where === "party" && to.where === "box" && !p.party.some((m, i) => i !== from.index && m.hp > 0)) return "last-fighter";

  if (from.where === "party") p.party.splice(from.index, 1);
  else p.boxes[from.box]!.slots[from.index] = null;
  if (to.where === "party") p.party.push(mon);
  else p.boxes[to.box]!.slots[to.index] = mon;
  return null;
}

export function renameBox(boxes: Boxes, box: number, name: string): PcRefusal | null {
  if (!boxes[box] || name.trim().length === 0 || name.length > BOX_NAME_MAX) return "invalid";
  boxes[box].name = name;
  return null;
}
