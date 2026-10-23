// Release tag rules: only vMAJOR.MINOR.PATCH, equal to the app version, new and
// newer than every published release.

export type ReleaseTagResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid-format" | "version-mismatch" | "already-published" | "not-newer";
      message: string;
    };

export interface ReleaseTagInput {
  tag: string;
  appVersion: string;
  /** Published versions, with or without the `v` prefix. */
  publishedVersions: readonly string[];
}

const TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parts(version: string): number[] {
  return version.replace(/^v/, "").split(".").map(Number);
}

function compare(a: string, b: string): number {
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function validateReleaseTag({ tag, appVersion, publishedVersions }: ReleaseTagInput): ReleaseTagResult {
  if (!TAG_PATTERN.test(tag)) {
    return {
      ok: false,
      reason: "invalid-format",
      message: `Tag "${tag}" inválida: use vMAJOR.MINOR.PATCH, sem sufixo (ex.: v1.2.3).`,
    };
  }
  const version = tag.slice(1);
  if (version !== appVersion) {
    return {
      ok: false,
      reason: "version-mismatch",
      message: `A tag ${tag} não bate com a versão do app (${appVersion}) em packages/app/package.json.`,
    };
  }
  if (publishedVersions.some((p) => compare(p, version) === 0)) {
    return { ok: false, reason: "already-published", message: `A versão ${version} já foi publicada.` };
  }
  const newer = publishedVersions.find((p) => compare(p, version) > 0);
  if (newer) {
    return {
      ok: false,
      reason: "not-newer",
      message: `A versão ${version} não é maior que a já publicada ${newer.replace(/^v/, "")}.`,
    };
  }
  return { ok: true };
}
