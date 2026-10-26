import { ptBR } from "./pt-BR";

// Interface texts (spec 017, research R2). Game texts come from the extracted catalog instead.

export type MessageKey = keyof typeof ptBR;

/** The text for `key`, with `{name}` placeholders filled from `vars`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return ptBR[key].replace(/\{(\w+)\}/g, (match, name: string) => (vars?.[name] !== undefined ? String(vars[name]) : match));
}
