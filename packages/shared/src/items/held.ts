import type { ItemRecord } from "../game-data/items.ts";
import type { HeldEffect, ItemEffects } from "./schemas.ts";

// Held items in real time (spec 027, research R5): the extracted hold-effect id picks the trigger in
// content/items/effects.json; the item's own parameter is the amount (Oran 10 HP, Sitrus 25%…).

export interface HeldItem {
  item: number;
  effect: HeldEffect;
  parameter: number;
  /** Berries and Focus Sash go when they act; Leftovers and the boosters stay. */
  consumable: boolean;
}

/** What `record` does when held; undefined for an item with no hold effect. */
export function heldOf(record: Pick<ItemRecord, "id" | "pocket" | "holdEffect">, effects: ItemEffects): HeldItem | undefined {
  if (record.holdEffect.id === 0) return undefined;
  const effect = effects.held[String(record.holdEffect.id)];
  if (!effect) return undefined;
  const consumable = record.pocket === "berries" || record.pocket === "medicine" || (effect.trigger === "survive" && effect.consumed);
  return { item: record.id, effect, parameter: record.holdEffect.parameter, consumable };
}

/** HP an hp-threshold berry gives back when HP has just fallen to `hp` of `max`; 0 when it does not act. */
export function thresholdHeal(held: HeldItem, hp: number, max: number): number {
  const e = held.effect;
  if (e.trigger !== "hp-threshold" || hp === 0 || hp > max * e.below) return 0;
  const amount = e.amount === "flat" ? held.parameter : e.amount === "percent" ? Math.floor((max * held.parameter) / 100) : Math.floor(max / Math.max(1, held.parameter));
  return Math.max(1, Math.min(max - hp, amount));
}

/** Damage multiplier of the attacker's held item for a move of `type` and `category`, given its effectiveness. */
export function damageMul(held: HeldItem | undefined, type: number, category: string, effectiveness: number): number {
  const e = held?.effect;
  if (!e) return 1;
  if (e.trigger === "type-boost") return e.type === type ? 1 + held.parameter / 100 : 1;
  if (e.trigger !== "damage-mul") return 1;
  if (e.category && e.category !== category) return 1;
  if (e.superEffectiveOnly && effectiveness <= 1) return 1;
  return e.mul;
}
