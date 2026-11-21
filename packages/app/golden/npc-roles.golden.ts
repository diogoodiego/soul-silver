// Block H probe, on the real extraction: the role each person's script gives them (the options around them).
// Every Center's nurse heals, every clerk names a shop the extraction has. Local only: `npm run golden`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { npcRole, POKEMON_CENTERS } from "@soulsilver/server";
import { expect, it } from "vitest";
import { loadServerData } from "../src/server-host/server-data";
import { defaultStages } from "./obtainable";

const stages = defaultStages();
if (!existsSync(join(stages, "maps"))) throw new Error(`Sem extração em ${stages}. Extraia a ROM pelo app e aponte SOULSILVER_DATA para a pasta stages.`);
const data = loadServerData(stages, () => undefined);
const MAPS = 600;

it("dá a enfermeira de cada Centro e os vendedores de cada loja", () => {
  const scripts = data.scripts!;
  const found: { map: number; person: number; role: string; shop?: number }[] = [];
  for (let map = 0; map < MAPS; map++) {
    for (const n of scripts.events(map)?.npcs ?? []) {
      if (!n.script || n.trainer) continue;
      const role = npcRole(n.script, (id) => scripts.file(id), (id) => scripts.resolve(id, map), POKEMON_CENTERS.has(String(map)));
      if (role) found.push({ map, person: n.id, ...role });
    }
  }
  const healers = new Set(found.filter((f) => f.role === "heal").map((f) => String(f.map)));
  const shops = found.filter((f) => f.role === "shop");
  console.log(`enfermeiras em ${healers.size} de ${POKEMON_CENTERS.size} Centros; ${shops.length} vendedores`);
  console.log(shops.map((s) => `mapa ${s.map} pessoa ${s.person}: loja ${s.shop}`).join("\n"));
  expect([...POKEMON_CENTERS].filter((c) => !healers.has(c))).toEqual([]);
  expect(found).toContainEqual({ map: 69, person: 0, role: "heal" });
  expect(found).toContainEqual({ map: 68, person: 0, role: "shop", shop: 0 });
  expect(shops.filter((s) => !data.shops?.shop(s.shop!))).toEqual([]);
});
