// Rules that keep ROMs, extracted assets and ROM-derived data out of the
// repository and out of the packaged app (constitution, principle II).
// Used by the pre-commit hook, CI and the release package check.

export type ForbiddenRuleId = "asset-dir" | "rom" | "ds-format" | "media-outside-art" | "media";

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

const ROM_RULE: Rule = { id: "rom", reason: "ROM do jogo", matches: (_p, ext) => ext === ".nds" };
const DS_FORMAT_RULE: Rule = {
  id: "ds-format",
  reason: "dado derivado da ROM",
  matches: (_p, ext) => DS_EXTENSIONS.has(ext),
};

// Order matters: the first matching rule is reported. Paths are lower-cased.
const RULES: Rule[] = [
  { id: "asset-dir", reason: "pasta de saída do extrator", matches: (p) => p.startsWith("assets/") },
  ROM_RULE,
  DS_FORMAT_RULE,
  {
    id: "media-outside-art",
    reason: "imagem ou áudio fora de art/",
    matches: (p, ext) => MEDIA_EXTENSIONS.has(ext) && !p.startsWith("art/"),
  },
];

// Inside the packaged app there is no art/ exception and an `assets` folder is
// forbidden at any depth.
const PACKAGE_RULES: Rule[] = [
  {
    id: "asset-dir",
    reason: "pasta de assets dentro do pacote",
    matches: (p) => p.split("/").slice(0, -1).includes("assets"),
  },
  ROM_RULE,
  DS_FORMAT_RULE,
  { id: "media", reason: "imagem ou áudio dentro do pacote", matches: (_p, ext) => MEDIA_EXTENSIONS.has(ext) },
];

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

function findViolations(rules: Rule[], paths: readonly string[]): ForbiddenFileViolation[] {
  const violations: ForbiddenFileViolation[] = [];
  for (const path of paths) {
    const normalized = path.replaceAll("\\", "/").toLowerCase();
    const ext = extensionOf(normalized);
    const rule = rules.find((r) => r.matches(normalized, ext));
    if (rule) violations.push({ path, ruleId: rule.id, reason: rule.reason });
  }
  return violations;
}

export function findForbiddenFiles(paths: readonly string[]): ForbiddenFileViolation[] {
  return findViolations(RULES, paths);
}

export function findForbiddenPackageFiles(paths: readonly string[]): ForbiddenFileViolation[] {
  return findViolations(PACKAGE_RULES, paths);
}
