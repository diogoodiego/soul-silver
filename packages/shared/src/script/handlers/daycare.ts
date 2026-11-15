import type { DaycareView, TextBuffer } from "../host.ts";
import type { CommandContext, Handler } from "../runner.ts";

// The Route 34 Day Care (spec 029, item 029.1): the lady's script, scr_seq 265, after pokeheartgold
// scrcmd_daycare.c, get_egg.c, scrcmd_party.c and scrcmd_c.c. The man's egg commands are a later item.

const NONE = 255;
const PARTY_SIZE = 6;
const nothing: Handler = () => undefined;
const answer = (ok: boolean) => (ok ? 1 : 0);
const slots = (c: CommandContext): DaycareView[] => c.host.daycare?.() ?? [];
const nick = (m: DaycareView): TextBuffer => (m.nickname ? { kind: "name", name: m.nickname } : { kind: "species", id: m.species });
const GENDER_SIGN = { male: "♂", female: "♀" } as const;

export const DAYCARE: Record<string, Handler> = {
  // Save_Daycare_GetState: 0 empty, 1 an egg waiting (none yet), 2 one Pokémon, 3 two.
  GetDaycareState: (c) => {
    const n = slots(c).length;
    c.writeVar(c.ptr("arg0"), c.host.daycareEgg?.() ? 1 : n === 0 ? 0 : n + 1);
  },
  // Spec 029.2: the egg. The Route 34 map script turns the man around while he holds one.
  CheckDaycareEgg: (c) => c.writeVar(c.ptr("arg0"), answer(c.host.daycareEgg?.() ?? false)),
  GetDaycareCompatibility: (c) => c.writeVar(c.ptr("arg0"), c.host.daycareCompatibility?.() ?? 3),
  GiveDaycareEgg: (c) => c.host.giveDaycareEgg?.(),
  ResetDaycareEgg: (c) => c.host.resetDaycareEgg?.(),
  // Save_Daycare_BufferStoredMonNicks: slot 0's name in 0 and its trainer's in 2, slot 1's name in 1.
  BufferDaycareMonNicks: (c) => {
    const [a, b] = slots(c);
    if (a) {
      c.buffers[0] = nick(a);
      // shortcut: the save keeps no original trainer, so it is the player; keep the OT when trades bring one.
      c.buffers[2] = { kind: "player" };
    }
    if (b) c.buffers[1] = nick(b);
  },
  // Party members alive plus every Pokémon in the PC.
  CountAliveMonsAndPC: (c) => c.writeVar(c.ptr("arg0"), (c.host.aliveMons?.() ?? 0) + (c.host.boxMonCount?.() ?? 0)),
  CountAliveMons: (c) => c.writeVar(c.ptr("var"), c.host.aliveMons?.(c.get("except")) ?? 0),
  // Opens the party menu; ScrCmd_552 reads the slot (255 for B) and whether the summary was asked for, which this menu does not offer.
  ScrCmd_551: (c) => c.block({ kind: "party" }, (slot) => (c.party.picked = slot < PARTY_SIZE ? slot : NONE)),
  ScrCmd_552: (c) => {
    c.writeVar(c.ptr("arg0"), c.party.picked);
    c.writeVar(c.ptr("arg1"), 0);
  },
  // shortcut: only Griseous Orb, Giratina, Rotom and Shaymin forms are undone here, and the save has no forms; handle them with the spec that adds forms.
  DaycareSanitizeMon: (c) => c.writeVar(c.ptr("arg1"), 0),
  PutMonInDaycare: (c) => c.host.daycareDeposit?.(c.get("arg0")),
  // Save_Daycare_BufferTailMonNick: the last one left, its name in 0 and its species in the variable.
  GetTailDaycareMonSpeciesAndNick: (c) => {
    const last = slots(c).at(-1);
    if (last) c.buffers[0] = nick(last);
    c.writeVar(c.ptr("arg0"), last?.species ?? 0);
  },
  // Save_Daycare_BufferGrowthAndNick: the levels gained, buffered in 1 with the name in 0; 0 for an empty slot.
  BufferDaycareMonGrowth: (c) => {
    const m = slots(c)[c.get("arg1")];
    if (m) {
      c.buffers[0] = nick(m);
      c.buffers[1] = { kind: "number", value: m.gained };
    }
    c.writeVar(c.ptr("arg0"), m?.gained ?? 0);
  },
  // Save_Daycare_BufferMonStats: name, level now and gender sign of a slot, for the withdraw menu.
  BufferDaycareMonStats: (c) => {
    const m = slots(c)[c.get("arg3")];
    if (!m) return;
    c.buffers[c.get("arg0")] = nick(m);
    c.buffers[c.get("arg1")] = { kind: "number", value: m.level };
    c.buffers[c.get("arg2")] = { kind: "text", text: m.gender ? GENDER_SIGN[m.gender] : "" };
  },
  // Save_Daycare_BufferMonNickAndRetrievalPrice: 100 plus 100 per level gained; the name in 0, the price in 1.
  BufferDaycareWithdrawCost: (c) => {
    const m = slots(c)[c.get("arg1")];
    const cost = ((m?.gained ?? 0) + 1) * 100;
    if (m) c.buffers[0] = nick(m);
    c.buffers[1] = { kind: "number", value: cost };
    c.writeVar(c.ptr("arg0"), cost);
  },
  HasEnoughMoneyVar: (c) => c.writeVar(c.ptr("var"), answer(c.host.money() >= c.get("amount"))),
  SubMoneyVar: (c) => c.host.addMoney(-c.get("var")),
  RetrieveDaycareMon: (c) => c.writeVar(c.ptr("arg0"), c.host.daycareRetrieve?.(c.get("arg1")) ?? 0),
  // shortcut: the money box and the Pokémon walking in the yard are not drawn; draw them when the Day Care gets its layer 4 pass.
  ShowMoneyBox: nothing,
  HideMoneyBox: nothing,
  UpdateMoneyBox: nothing,
  UpdateDaycareMonObjects: nothing,
  // Spec 029.4: the egg hatches, then the client plays the animation and says what hatched.
  // shortcut: no nickname prompt after the hatch; ask with the "name" request when the naming screen is wanted here.
  EggHatchAnim: (c) => {
    const species = c.host.hatchEgg?.();
    if (species !== undefined) c.block({ kind: "hatch", species });
  },
};
