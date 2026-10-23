// Rules that keep ROMs, extracted assets and ROM-derived data out of the
// repository (constitution, principle II). Used by the pre-commit hook and CI.

export type ForbiddenRuleId = "asset-dir" | "rom" | "ds-format" | "media-outside-art";

export interface ForbiddenFileViolation {
  path: string;
  ruleId: ForbiddenRuleId;
  reason: string;
}

const DS_EXTENSIONS = new Set([
  ".narc", ".arc", ".ncgr", ".nclr", ".nscr", ".ncer", ".nanr", ".nmcr", ".nmar", ".nsbmd",
  ".nsbtx", ".nsbca", ".nsbta", ".nsbtp", ".nsbma", ".nsbva", ".sdat", ".sseq", ".ssar", ".sbnk",
  ".swar", ".strm", ".bmg",
]);

const MEDIA_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tga", ".ico", ".svg", ".wav", ".ogg",
  ".mp3", ".flac", ".mid", ".midi",
]);

interface Rule {
  id: ForbiddenRuleId;
  reason: string;
  matches(path: string, ext: string): boolean;
}

// Order matters: the first matching rule is reported. Paths are lower-cased.
const RULES: Rule[] = [
  { id: "asset-dir", reason: "pasta de saída do extrator", matches: (p) => p.startsWith("assets/") },
  { id: "rom", reason: "ROM do jogo", matches: (_p, ext) => ext === ".nds" },
  { id: "ds-format", reason: "dado derivado da ROM", matches: (_p, ext) => DS_EXTENSIONS.has(ext) },
  {
    id: "media-outside-art",
    reason: "imagem ou áudio fora de art/",
    matches: (p, ext) => MEDIA_EXTENSIONS.has(ext) && !p.startsWith("art/"),
  },
];

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

export function findForbiddenFiles(paths: readonly string[]): ForbiddenFileViolation[] {
  const violations: ForbiddenFileViolation[] = [];
  for (const path of paths) {
    const normalized = path.replaceAll("\\", "/").toLowerCase();
    const ext = extensionOf(normalized);
    const rule = RULES.find((r) => r.matches(normalized, ext));
    if (rule) violations.push({ path, ruleId: rule.id, reason: rule.reason });
  }
  return violations;
}
