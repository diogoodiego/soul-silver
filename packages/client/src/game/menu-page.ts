/** An app of the Pokédex phone (block H), opened from its home grid; undefined is the grid itself. */
export type MenuPage = "party" | "bag" | "dex" | "trainer" | "gear" | "clock" | "field" | "online" | "save" | "settings";

/** The home grid, in order. */
export const APPS: readonly MenuPage[] = ["party", "bag", "dex", "trainer", "gear", "clock", "field", "online", "save", "settings"];
