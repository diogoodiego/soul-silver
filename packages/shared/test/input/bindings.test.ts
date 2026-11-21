import { describe, expect, it } from "vitest";
import { ACTIONS, DEFAULT_KEYS, DIRECTIONS, PAD_BUTTONS, rebind, sameContext } from "../../src/input";
import { readSettings } from "../../src/settings.ts";

describe("defaults", () => {
  it("binds every action to at least one key and one pad button", () => {
    for (const a of ACTIONS) {
      expect(DEFAULT_KEYS[a].length).toBeGreaterThan(0);
      expect(PAD_BUTTONS[a]).toBeGreaterThanOrEqual(0);
    }
  });

  it("uses the Xbox standard mapping for the menu: A confirms, B cancels, Start opens", () => {
    expect(PAD_BUTTONS.confirm).toBe(0);
    expect(PAD_BUTTONS.cancel).toBe(1);
    expect(PAD_BUTTONS.menu).toBe(9);
    // A also talks to people on the map; in combat it is move 1.
    expect(PAD_BUTTONS.interact).toBe(0);
  });

  it("keeps the spec 011–015 keys (moves on J K L I)", () => {
    expect(DEFAULT_KEYS.move1).toEqual(["KeyJ"]);
    expect(DEFAULT_KEYS.dash).toEqual(["Space"]);
    expect(DEFAULT_KEYS.up).toContain("ArrowUp");
    expect(DEFAULT_KEYS.up).toContain("KeyW");
  });

  it("never gives one pad button two actions in the same context", () => {
    // On the map the left stick moves, so the D-pad only navigates menus.
    const pad = ACTIONS.filter((a) => !(DIRECTIONS as readonly string[]).includes(a));
    for (const a of pad) for (const b of pad) if (a < b && sameContext(a, b)) expect(PAD_BUTTONS[a], `${a}/${b}`).not.toBe(PAD_BUTTONS[b]);
  });

  it("never gives one key two actions in the same context", () => {
    for (const a of ACTIONS)
      for (const b of ACTIONS) if (a < b && sameContext(a, b)) expect(DEFAULT_KEYS[a].filter((k) => DEFAULT_KEYS[b].includes(k)), `${a}/${b}`).toEqual([]);
  });

  it("allows Space for dash on the map and confirm in menus", () => {
    expect(DEFAULT_KEYS.confirm).toContain("Space");
    expect(sameContext("dash", "confirm")).toBe(false);
  });

  it("puts interact on Space with the dodge: one only out of combat, the other only in it", () => {
    expect(DEFAULT_KEYS.interact).toEqual(["Space"]);
    expect(DEFAULT_KEYS.dash).toEqual(["Space"]);
    expect(sameContext("interact", "dash")).toBe(false);
    expect(sameContext("interact", "combat")).toBe(true);
    expect(sameContext("dash", "combat")).toBe(true);
  });

  it("swaps Pokémon with Q (previous) and E (next)", () => {
    expect(DEFAULT_KEYS.picker).toEqual(["KeyQ"]);
    expect(DEFAULT_KEYS.swapNext).toEqual(["KeyE"]);
  });
});

describe("rebind", () => {
  it("replaces the action's keys with the new one", () => {
    const { bindings, swapped } = rebind(DEFAULT_KEYS, "combat", "KeyZ");
    expect(bindings.combat).toEqual(["KeyZ"]);
    expect(swapped).toBeUndefined();
  });

  it("swaps when the key belongs to another action in the same context", () => {
    const { bindings, swapped } = rebind(DEFAULT_KEYS, "combat", "KeyR");
    expect(swapped).toBe("recall");
    expect(bindings.combat).toEqual(["KeyR"]);
    expect(bindings.recall).toEqual(["KeyF"]);
  });

  it("does not swap across contexts", () => {
    const { bindings, swapped } = rebind(DEFAULT_KEYS, "tabNext", "KeyF");
    expect(swapped).toBeUndefined();
    expect(bindings.combat).toEqual(["KeyF"]);
  });

  it("rejects reserved keys", () => {
    for (const key of ["F11", "MetaLeft", "MetaRight", "AltLeft", "F4"]) expect(() => rebind(DEFAULT_KEYS, "combat", key)).toThrow();
  });

  it("does not mutate the input", () => {
    const before = structuredClone(DEFAULT_KEYS);
    rebind(DEFAULT_KEYS, "combat", "KeyR");
    expect(DEFAULT_KEYS).toEqual(before);
  });
});

describe("saved bindings", () => {
  it("keep the player's keys when a later action is missing from them", () => {
    const older: Record<string, readonly string[]> = { ...DEFAULT_KEYS, combat: ["KeyZ"] };
    delete older["rod"];
    const settings = readSettings({ bindings: older });
    expect(settings.bindings.combat).toEqual(["KeyZ"]);
    expect(settings.bindings.rod).toEqual(DEFAULT_KEYS.rod);
  });

  it("move interact off E to Space when E becomes the next-Pokémon key", () => {
    const older: Record<string, readonly string[]> = { ...DEFAULT_KEYS, interact: ["KeyE"] };
    delete older["swapNext"];
    const settings = readSettings({ bindings: older });
    expect(settings.bindings.interact).toEqual(["Space"]);
    expect(settings.bindings.swapNext).toEqual(["KeyE"]);
  });

  it("give Escape to back only: the menu (the phone) opens on Tab", () => {
    expect(DEFAULT_KEYS.menu).toEqual(["Tab"]);
    expect(readSettings({ bindings: { ...DEFAULT_KEYS, menu: ["Tab", "Escape"] } }).bindings.menu).toEqual(["Tab"]);
    expect(readSettings({ bindings: { ...DEFAULT_KEYS, menu: ["Escape"] } }).bindings.menu).toEqual(["Tab"]);
    // Escape no longer backs out (the player rebound cancel): their menu key stays.
    expect(readSettings({ bindings: { ...DEFAULT_KEYS, cancel: ["Backspace"], menu: ["Escape"] } }).bindings.menu).toEqual(["Escape"]);
  });

  it("keep interact on a key the player chose", () => {
    const older: Record<string, readonly string[]> = { ...DEFAULT_KEYS, interact: ["KeyZ"] };
    delete older["swapNext"];
    expect(readSettings({ bindings: older }).bindings.interact).toEqual(["KeyZ"]);
  });
});
