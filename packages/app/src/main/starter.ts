import { createRng } from "@soulsilver/shared/game";
import { starterMember } from "@soulsilver/shared/progression";
import type { PartyMember } from "@soulsilver/shared/save";
import { readExtracted } from "../server-host/extracted";

/** The chosen starter for a new save (spec 017), from the extracted species and learnsets; throws when they are missing. */
export function makeStarter(stagesDir: string, species: number): PartyMember {
  const record = readExtracted(stagesDir, "species").find((s) => s.id === species);
  if (!record) throw new Error(`espécie ${species} ausente`);
  const levelUp = readExtracted(stagesDir, "learnsets").find((l) => l.id === species)?.levelUp ?? [];
  return starterMember(record, levelUp, createRng(Math.floor(Math.random() * 2 ** 31)));
}
