// No relative imports: this module is also loaded by the extractor CLI under plain
// Node type stripping, which does not resolve extensionless specifiers.

/** Region from the 4th letter of the DS game code; see specs/003-rom-extraction-pipeline/research.md R1. */
export type RomRegion = "usa" | "japan" | "korea" | "europe" | "france" | "germany" | "italy" | "spain" | "unknown";

export type RomRejection =
  | { reason: "unreadable" }
  | { reason: "archive"; format: "zip" | "7z" | "rar" }
  | { reason: "not-ds-rom" }
  | { reason: "other-game"; title: string; gameCode: string }
  | { reason: "heartgold"; region: RomRegion }
  | { reason: "other-region"; region: RomRegion; gameCode: string }
  | { reason: "modified" };

export type RomValidationResult =
  | { ok: true; sha1: string; size: number }
  | { ok: false; rejection: RomRejection };

const ASK = "Escolha o arquivo de Pokémon SoulSilver (EUA), com extensão .nds.";

/** "a versão ___" with the right Portuguese preposition and article. */
const FROM_REGION: Record<RomRegion, string> = {
  usa: "dos EUA",
  japan: "do Japão",
  korea: "da Coreia",
  europe: "da Europa",
  france: "da França",
  germany: "da Alemanha",
  italy: "da Itália",
  spain: "da Espanha",
  unknown: "de região desconhecida",
};

/** Player-facing text (PT-BR) shared by the app and the CLI (FR-003). */
export function romRejectionMessage(rejection: RomRejection): { title: string; detail: string } {
  switch (rejection.reason) {
    case "unreadable":
      return { title: "Não foi possível ler o arquivo", detail: `Confira se o arquivo ainda existe e não está aberto em outro programa. ${ASK}` };
    case "archive":
      return {
        title: `Esse é um arquivo compactado (.${rejection.format})`,
        detail: `Extraia o conteúdo primeiro (clique com o botão direito → Extrair) e escolha o arquivo .nds que estava dentro. ${ASK}`,
      };
    case "not-ds-rom":
      return { title: "Esse arquivo não é uma ROM de Nintendo DS", detail: ASK };
    case "other-game": {
      const name = rejection.title.length > 0 ? `"${rejection.title}"` : `de código ${rejection.gameCode}`;
      return { title: "Essa ROM é de outro jogo", detail: `O arquivo é do jogo ${name}. ${ASK}` };
    }
    case "heartgold":
      return {
        title: "Essa ROM é de Pokémon HeartGold",
        detail: `HeartGold é a versão irmã de SoulSilver, mas este jogo precisa da SoulSilver. ${ASK}`,
      };
    case "other-region":
      return {
        title: `Essa ROM é a versão ${FROM_REGION[rejection.region]} de SoulSilver`,
        detail: `Só a versão dos EUA é aceita. ${ASK}`,
      };
    case "modified":
      return {
        title: "Esse arquivo está corrompido ou foi alterado",
        detail: `Ele parece ser SoulSilver (EUA), mas o conteúdo não confere com uma cópia original (pode estar incompleto, corrompido ou ser um hack). Gere uma cópia nova do seu cartucho. ${ASK}`,
      };
  }
}
