// Item probe (spec 027, layer 3), on the real extraction: the Dowsing MCHN finds every hidden item of Routes 29
// to 31 as the extracted events place them, and every item obtainable up to Violet City has a use scenario that
// works (packages/app/golden/obtainable.ts). Local only: `npm run golden`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BUTTON } from "@soulsilver/shared/game";
import { dowse } from "@soulsilver/shared/items";
import { MAP_TILE_PX } from "@soulsilver/shared/maps";
import { bundledItemRules } from "@soulsilver/server";
import { expect, it } from "vitest";
import { readNewGameStart } from "../src/server-host/extracted";
import { loadServerData } from "../src/server-host/server-data";
import { defaultStages, hiddenOn, obtainableUntilViolet, ROUTES_29_TO_31 } from "./obtainable";
import type { Check } from "./report";
import { itemProbe } from "./item-scenarios";

const stages = defaultStages();
const DOWSING = 471;
const CYNDAQUIL = 155;

function world() {
  if (!existsSync(join(stages, "events", "events", "field-items.json"))) throw new Error(`Sem field-items.json em ${stages}: rode a extração de novo (etapa events).`);
  const data = loadServerData(stages, () => undefined);
  const start = readNewGameStart(stages, () => undefined)!;
  return { data, start };
}
const { data, start } = world();

const { play, member, scenario, kind } = itemProbe(data, start);

it("the Dowsing MCHN finds every hidden item of Routes 29 to 31 (spec 027, US6)", () => {
  const checks: Check[] = [];
  for (const map of ROUTES_29_TO_31) {
    const all = hiddenOn(stages, map);
    const o = data.world!(String(map))!.origin ?? { tx: 0, ty: 0 };
    const at = (h: { x: number; z: number }) => ({ x: (h.x - o.tx) * MAP_TILE_PX + MAP_TILE_PX / 2, y: (h.z - o.ty) * MAP_TILE_PX + MAP_TILE_PX / 2 });
    for (const h of all) {
      const g = play({ bag: [{ item: DOWSING, count: 1 }], party: [member(CYNDAQUIL, 10)] });
      const name = `mapa ${map}, escondido ${h.index} (${h.x},${h.z}): item ${h.item}`;
      g.send({ type: "debugWarp", map, tx: h.x, ty: h.z - 3 });
      g.send({ type: "use-item", item: DOWSING, partyIndex: 0 }, 6);
      const seen = g.last("dowse");
      const expected = dowse({ x: at(h).x, y: at(h).y - 3 * MAP_TILE_PX }, all.map(at), bundledItemRules().tuning.dowsing.radiusTiles * MAP_TILE_PX);
      g.send({ type: "debugWarp", map, tx: h.x, ty: h.z - 1 });
      g.press(BUTTON.interact);
      g.step(60);
      const picked = g.bag().some((b) => b.item === h.item);
      g.close();
      const failed = !seen || seen.dir === undefined ? "o Dowsing não apontou nada a 3 tiles" : expected && Math.abs(seen.dir - expected.dir) > 1 ? `apontou ${seen.dir}°, esperado ${expected.dir}°` : !picked ? "não pegou o item no tile" : undefined;
      checks.push({ name, failed });
    }
    // A route with none in the extracted events (Route 31) has nothing to find.
    if (all.length === 0) checks.push({ name: `mapa ${map}: nenhum item escondido nos eventos extraídos`, failed: undefined });
  }
  if (!checks.some((c) => c.name.includes("escondido "))) checks.push({ name: "rotas 29 a 31", failed: "nenhum item escondido" });
  console.log([...checks.map((c) => (c.failed ? `FALHOU ${c.name}: ${c.failed}` : `ok  ${c.name}`)), `${checks.filter((c) => !c.failed).length} de ${checks.length} itens escondidos das rotas 29 a 31`].join("\n"));
  expect(checks.filter((c) => c.failed)).toEqual([]);
});

it("every item obtainable up to Violet City has a use that works (spec 027, layer 3)", () => {
  const checks: Check[] = [...obtainableUntilViolet(stages).keys()].sort((a, b) => a - b).map((item) => ({ name: `item ${item} (${kind(item)})`, failed: scenario(item) }));
  console.log([...checks.map((c) => (c.failed ? `FALHOU ${c.name}: ${c.failed}` : `ok  ${c.name}`)), `${checks.filter((c) => !c.failed).length} de ${checks.length} itens obtíveis até Violet City`].join("\n"));
  expect(checks.filter((c) => c.failed)).toEqual([]);
});
