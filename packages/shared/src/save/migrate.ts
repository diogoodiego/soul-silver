import type { z } from "zod";
import { SAVE_SCHEMA_VERSION, saveSchema, type Save } from "./schema.ts";

export type SaveFailureCode = "invalid" | "save-too-new";
export type MigrateResult<T = Save> = { ok: true; save: T } | { ok: false; code: SaveFailureCode; message: string };

type Step = (save: Record<string, unknown>) => Record<string, unknown>;

/** Steps from version n to n + 1. Empty until the first format change; every new entry needs a test. */
export const SAVE_MIGRATIONS: Record<number, Step> = {};

export interface MigrateOptions {
  current: number;
  migrations: Record<number, Step>;
  schema: z.ZodType;
}

function invalid(message: string): MigrateResult<never> {
  return { ok: false, code: "invalid", message: `Save inválido: ${message}` };
}

/** Brings any stored save to the current version and validates it. */
export function migrate(raw: unknown): MigrateResult;
export function migrate(raw: unknown, options: MigrateOptions): MigrateResult<unknown>;
export function migrate(raw: unknown, options?: MigrateOptions): MigrateResult<unknown> {
  const current = options?.current ?? SAVE_SCHEMA_VERSION;
  const migrations = options?.migrations ?? SAVE_MIGRATIONS;
  const schema = options?.schema ?? saveSchema;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return invalid("o save não é um objeto");
  let save = raw as Record<string, unknown>;
  const found = save["schemaVersion"];
  if (typeof found !== "number" || !Number.isInteger(found) || found < 1) return invalid("schemaVersion ausente ou inválido");
  if (found > current) {
    return { ok: false, code: "save-too-new", message: `Save da versão ${found}; este app entende até a ${current}. Atualize o jogo.` };
  }
  for (let version = found; version < current; version++) {
    const step = migrations[version];
    if (!step) return invalid(`falta a migração da versão ${version} para ${version + 1}`);
    save = step(save);
  }
  const parsed = schema.safeParse(save);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return invalid(`${issue?.path.join(".") || "save"}: ${issue?.message ?? "inválido"}`);
  }
  return { ok: true, save: parsed.data };
}
