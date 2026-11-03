import { migrate, type Save } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { failedCheck, type Milestone } from "../golden/milestones";
import { optionalMissing, report } from "../golden/report";

// Spec 024 US6: the golden path's milestone checks and report, on synthetic data (principle II).

const base = (): Save => {
  const r = migrate({ schemaVersion: 1, name: "Gold", character: "male", area: "64", x: 104, y: 104, facing: "south", playTimeMs: 0, savedAt: "2026-11-03T12:00:00.000Z", rev: 0 });
  if (!r.ok) throw new Error(r.message);
  return r.save;
};
const mom: Milestone = { n: 2, name: "Cena da mãe concluída", checks: { vars: { 0x4106: 1 } } };
const starter: Milestone = { n: 3, name: "Inicial recebido", checks: { party: 1, flags: [106], items: { 484: 0 } } };

describe("milestone checks", () => {
  it("passes when every check holds and nothing shows twice", () => {
    expect(failedCheck(mom, { save: { ...base(), vars: { [String(0x4106)]: 1 } }, duplicates: [] })).toBeUndefined();
  });

  it("names the first check that failed", () => {
    expect(failedCheck(mom, { save: base(), duplicates: [] })).toBe("var 0x4106 = 1 (está 0)");
    expect(failedCheck(starter, { save: { ...base(), flags: [106] }, duplicates: [] })).toBe("time com 1 Pokémon (tem 0)");
    expect(failedCheck({ n: 1, name: "x", checks: { map: 64, badges: 1, rivalNamed: true } }, { save: base(), duplicates: [] })).toBe("insígnias ≥ 1 (tem 0)");
    expect(failedCheck({ n: 1, name: "x", checks: { rivalNamed: true } }, { save: base(), duplicates: [] })).toBe("rival com nome");
    expect(failedCheck({ n: 1, name: "x", checks: { items: { 4: 5 } } }, { save: { ...base(), bag: [{ item: 4, count: 2 }] }, duplicates: [] })).toBe("item 4 × 5 na bolsa (tem 2)");
    expect(failedCheck({ n: 1, name: "x", checks: { items: { 484: 0 } } }, { save: { ...base(), bag: [{ item: 484, count: 1 }] }, duplicates: [] })).toBe("item 484 fora da bolsa (tem 1)");
    expect(failedCheck({ n: 1, name: "x", checks: { map: 61 } }, { save: base(), duplicates: [] })).toBe("mapa 61 (está 64)");
  });

  it("checks that one of the trainers was beaten, by its defeated flag", () => {
    const rival: Milestone = { n: 6, name: "x", checks: { beaten: [495, 496, 497] } };
    expect(failedCheck(rival, { save: base(), duplicates: [], trainerFlagBase: 1360 })).toBe("treinador 495, 496 ou 497 vencido");
    expect(failedCheck(rival, { save: { ...base(), flags: [1360 + 496] }, duplicates: [], trainerFlagBase: 1360 })).toBeUndefined();
  });

  it("fails on a character shown twice, naming the objects", () => {
    expect(failedCheck(mom, { save: { ...base(), vars: { [String(0x4106)]: 1 } }, duplicates: [[4, 8]] })).toBe("nenhum personagem duplicado (objetos 4 e 8)");
  });
});

describe("golden report", () => {
  it("lists the milestones reached and the total", () => {
    expect(report([mom, starter], 10)).toBe(["ok  2. Cena da mãe concluída", "ok  3. Inicial recebido", "2 de 10 marcos"].join("\n"));
  });

  it("on a failure, gives the milestone, the check, the last script, the position, the map's conditions and the milestone's flags and variables", () => {
    const text = report([mom], 10, {
      milestone: starter,
      check: "time com 1 Pokémon (tem 0)",
      lastScript: "843:11",
      position: { map: "61", tx: 7, ty: 7 },
      triggers: [{ kind: "trigger", script: "843:11", condition: "var 0x4108 = 0 @ (4, 10) 2×1", met: false }],
      save: { ...base(), flags: [352], vars: { [String(0x4108)]: 1 } },
    });
    expect(text).toBe(
      [
        "ok  2. Cena da mãe concluída",
        "FALHOU 3. Inicial recebido: time com 1 Pokémon (tem 0)",
        "  último script: 843:11",
        "  posição: mapa 61, tile (7, 7)",
        "  condições do mapa:",
        "    trigger 843:11: var 0x4108 = 0 @ (4, 10) 2×1 (não)",
        "  flags: 106 desligada",
        "1 de 10 marcos",
      ].join("\n"),
    );
  });

  it("adds the checks of specs 020–023 and, apart, the optional commands still missing", () => {
    const text = report([mom], 10, undefined, {
      checks: [{ name: "luta 8 (Rota 30)" }, { name: "loja de Cherrygrove", failed: "estoque 17, 4 (oferecido 17)" }],
      optional: ["BankTransaction", "CameronPhoto"],
    });
    expect(text).toBe(
      [
        "ok  2. Cena da mãe concluída",
        "1 de 10 marcos",
        "ok  luta 8 (Rota 30)",
        "FALHOU loja de Cherrygrove: estoque 17, 4 (oferecido 17)",
        "1 de 2 checks dos specs 020–023",
        "comandos sem implementação fora do caminho principal (não reprovam): BankTransaction, CameronPhoto",
      ].join("\n"),
    );
  });
});

describe("optional missing commands", () => {
  const commands = [
    { name: "CameronPhoto", count: 3, maps: [33, 500] },
    { name: "BankTransaction", count: 1, maps: [63] },
    { name: "Message", count: 9, maps: [33] },
    { name: "GiveTogepiEgg", count: 1, maps: [999] },
    { name: "NameRival", count: 1, maps: [61] },
  ];
  it("lists the unhandled commands of the stretch's maps that the run never hit, sorted", () => {
    const handled = (name: string) => name === "Message";
    expect(optionalMissing(commands, new Set([33, 61, 63]), handled, new Set(["NameRival"]))).toEqual(["BankTransaction", "CameronPhoto"]);
  });
});
