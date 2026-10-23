/** Auto-update state shown by the renderer; see specs/002-release-autoupdate/data-model.md. */
export type UpdateState =
  | { status: "disabled" }
  | { status: "checking" }
  | { status: "up-to-date" }
  /** percent: 0–100, never decreases. */
  | { status: "downloading"; version: string; percent: number }
  | { status: "ready"; currentVersion: string; newVersion: string }
  | { status: "check-failed" };
