import type { TYPE_KEYS } from "@soulsilver/shared/game-data";

/** Move button color per type (spec 017, FR-007), close to the original's type badges. */
export const TYPE_COLORS: Record<(typeof TYPE_KEYS)[number], string> = {
  normal: "#a8a878",
  fighting: "#c03028",
  flying: "#a890f0",
  poison: "#a040a0",
  ground: "#e0c068",
  rock: "#b8a038",
  bug: "#a8b820",
  ghost: "#705898",
  steel: "#b8b8d0",
  unknown: "#68a090",
  fire: "#f08030",
  water: "#6890f0",
  grass: "#78c850",
  electric: "#f8d030",
  psychic: "#f85888",
  ice: "#98d8d8",
  dragon: "#7038f8",
  dark: "#705848",
};

/** HP bar color: green, yellow under half, red under a fifth. */
export const hpColor = (f: number) => (f > 0.5 ? "#4caf50" : f > 0.2 ? "#f5c518" : "#e53935");
