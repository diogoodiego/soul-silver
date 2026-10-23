// Validates a release tag against the app version and the published releases.
// Usage: node scripts/check-release-tag.ts <tag>   (needs GH_TOKEN for `gh`)
// Exit codes: 0 valid, 1 invalid, 2 usage or gh error.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { validateReleaseTag } from "./release-tag.ts";

const tag = process.argv[2];
if (!tag) {
  console.error("Uso: node scripts/check-release-tag.ts <tag>");
  process.exit(2);
}

const appVersion = (JSON.parse(readFileSync("packages/app/package.json", "utf8")) as { version: string }).version;

let publishedVersions: string[];
try {
  const output = execFileSync("gh", ["release", "list", "--limit", "1000", "--json", "tagName"], {
    encoding: "utf8",
  });
  publishedVersions = (JSON.parse(output) as { tagName: string }[]).map((r) => r.tagName);
} catch (error) {
  console.error(`Falha ao consultar as releases com gh: ${(error as Error).message}`);
  process.exit(2);
}

const result = validateReleaseTag({ tag, appVersion, publishedVersions });
if (!result.ok) {
  console.error(`✖ ${result.message}`);
  process.exit(1);
}
console.log(`Tag ${tag} válida.`);
