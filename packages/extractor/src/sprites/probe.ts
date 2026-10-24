// R0 probe (specs/007-sprite-atlas/research.md): checks the sprite archive layout against an
// existing rom-unpack output. Prints counts only, never ROM bytes.
// Usage: node packages/extractor/src/sprites/probe.ts <rom-unpack narc dir>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BATTLE_MEMBERS_PER_SPECIES, SPRITE_ARCHIVES } from "./layout.ts";

const root = process.argv[2] ?? "assets/stages/rom-unpack/narc";
const dir = join(root, SPRITE_ARCHIVES.pokemonBattle);
const members = readdirSync(dir).filter((f) => f.endsWith(".bin")).sort().map((f) => readFileSync(join(dir, f)));

// Per species: which of the four graphics (female back, male back, female front, male front)
// have data. Expected on the accepted ROM: 1111 x412, 0101 x66, 1010 x16.
const patterns = new Map<string, number>();
for (let s = 0; s * BATTLE_MEMBERS_PER_SPECIES < members.length; s++) {
  const key = [0, 1, 2, 3].map((k) => (members[s * BATTLE_MEMBERS_PER_SPECIES + k]!.length > 0 ? 1 : 0)).join("");
  patterns.set(key, (patterns.get(key) ?? 0) + 1);
}
console.log(`${SPRITE_ARCHIVES.pokemonBattle}: ${members.length} members, ${members.length / BATTLE_MEMBERS_PER_SPECIES} groups`);
for (const [key, count] of patterns) console.log(`  graphics ${key}: ${count} species`);
