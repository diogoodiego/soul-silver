import { describe, expect, it } from "vitest";
import { type RomRejection, romRejectionMessage } from "../src/rom-validation";

const ASK = "Escolha o arquivo de Pokémon SoulSilver (EUA), com extensão .nds.";

const all: RomRejection[] = [
  { reason: "unreadable" },
  { reason: "archive", format: "zip" },
  { reason: "not-ds-rom" },
  { reason: "other-game", title: "OTHER GAME", gameCode: "ABCE" },
  { reason: "heartgold", region: "usa" },
  { reason: "other-region", region: "japan", gameCode: "IPGJ" },
  { reason: "modified" },
];

describe("romRejectionMessage", () => {
  it.each(all)("gives a title and a detail ending with what to provide (%o)", (rejection) => {
    const message = romRejectionMessage(rejection);
    expect(message.title.length).toBeGreaterThan(0);
    expect(message.detail.endsWith(ASK)).toBe(true);
  });

  it("names HeartGold", () => {
    expect(romRejectionMessage({ reason: "heartgold", region: "europe" }).title).toContain("HeartGold");
  });

  it.each([
    ["japan", "Japão"],
    ["korea", "Coreia"],
    ["europe", "Europa"],
    ["france", "França"],
    ["germany", "Alemanha"],
    ["italy", "Itália"],
    ["spain", "Espanha"],
    ["unknown", "região desconhecida"],
  ] as const)("names the region %s in Portuguese", (region, name) => {
    const { title, detail } = romRejectionMessage({ reason: "other-region", region, gameCode: "IPGX" });
    expect(`${title} ${detail}`).toContain(name);
  });

  it("asks to extract archives first", () => {
    expect(romRejectionMessage({ reason: "archive", format: "7z" }).detail).toMatch(/extraia/i);
  });

  it("mentions the other game's title when known", () => {
    expect(romRejectionMessage({ reason: "other-game", title: "MARIO", gameCode: "AMCE" }).detail).toContain("MARIO");
  });
});
