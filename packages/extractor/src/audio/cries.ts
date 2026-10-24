// Cries: the game plays every cry with one sequence and the bank of the species (PlayCry in the
// game code). Only Shaymin's Sky Forme has a bank of its own. See research.md R0 and R6.
import { CRY_SEQUENCE, SHAYMIN, SHAYMIN_SKY_BANK } from "./layout.ts";
import { renderSequence, type RenderedTrack, type SoundSource } from "./render.ts";

/** Forms with a cry of their own: [species, form]. Every other form uses form 0's cry. */
export const CRY_FORMS: readonly (readonly [number, number])[] = [[SHAYMIN, 1]];

export function cryBank(species: number, form: number): number {
  return species === SHAYMIN && form === 1 ? SHAYMIN_SKY_BANK : species;
}

export function renderCry(source: SoundSource, species: number, form: number): RenderedTrack {
  return renderSequence(source, CRY_SEQUENCE, cryBank(species, form));
}
