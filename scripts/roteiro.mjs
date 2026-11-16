#!/usr/bin/env node
// Gera o roteiro detalhado (PT-BR) dos scripts extraídos da ROM, mapa a mapa.
// Saída fica em .evidence/roteiro/ (fora do git: contém texto do jogo, constituição, princípio II).
// Uso: node scripts/roteiro.mjs --blocks 032,033 [--maps 225,138] [--name johto-032-034]
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const S = join(root, "assets/stages");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const J = (...p) => JSON.parse(readFileSync(join(S, ...p), "utf8"));
const bank = (b) => {
  const p = join(S, "text-catalog/catalog/en", `${String(b).padStart(4, "0")}.json`);
  return existsSync(p) ? new Map(J("text-catalog/catalog/en", `${String(b).padStart(4, "0")}.json`).records.map((r) => [r.id, r.text])) : new Map();
};
const banks = new Map();
const txt = (b, i) => { if (!banks.has(b)) banks.set(b, bank(b)); return banks.get(b).get(i); };
const clean = (t) => (t ?? "(sem texto)").replace(/\{n\}/g, " ").replace(/\{scroll\}/g, " ").replace(/\{page\}/g, " ▸ ")
  .replace(/\{trainer-name:0\}/g, "[JOGADOR]").replace(/\{trainer-name:1\}/g, "[RIVAL]").replace(/\{cmd:0200:0\}/g, "[Sim/Não]")
  .replace(/\{cmd:FF01:\d+\}/g, "").replace(/\s+▸\s*$/, "").trim();

const SEC = bank(279), SPN = bank(237), ITN = bank(222), TRN = bank(729), CLN = bank(730);
const headers = new Map(J("maps/maps/map-headers.json").records.map((h) => [h.id, h]));
const items = new Map(J("data-items/json/items.json").records.map((r) => [r.id, r]));
const itemName = (id) => { const r = items.get(id); return r ? (ITN.get(r.name.index) ?? `item ${id}`) : `item ${id}`; };
const trainers = new Map(J("events/events/trainers.json").records.map((r) => [r.id, r]));
const ref = (s) => (typeof s === "string" ? Number(s.split(":")[1]) : s);
const trainer = (id) => {
  const r = trainers.get(id);
  if (!r) return `treinador ${id}`;
  return `treinador ${id} — ${CLN.get(ref(r.class.text)) ?? ""} ${TRN.get(ref(r.name)) ?? ""}${r.doubleBattle ? " (dupla)" : ""}: ${r.team.map((m) => `${SPN.get(m.species) ?? m.species} nv. ${m.level}`).join(", ")}`;
};
const audio = new Map(J("audio/audio/index.json").tracks.map((t) => [t.id, t]));
const au = (i) => { const t = audio.get(i); return t ? `${i} ${t.name}` : `${i}`; };
const sheets = new Map();
for (const f of ["overworld-npc", "overworld-player", "overworld-pokemon"]) {
  for (const s of J("sprites/sprites", `${f}.json`).sprites) for (const g of s.gfx ?? []) sheets.set(g, `${s.name}${s.character ? ` (${s.character})` : ""}`);
}
const sprite = (g) => sheets.get(g) ?? "SEM FOLHA";

const DIR = { North: "norte", South: "sul", East: "leste", West: "oeste" };
const SPEED = { Slow: "devagar", Normal: "", SlightlyFast: "um pouco rápido", Fast: "rápido", Faster: "mais rápido", Fastest: "muito rápido" };
function move(a, n) {
  let m;
  const x = n > 1 ? `${n}` : "1";
  if ((m = a.match(/^Walk(OnSpot)?(Slow|Normal|SlightlyFast|Fast|Faster|Fastest)?(North|South|East|West)$/))) {
    const sp = SPEED[m[2] ?? "Normal"]; return m[1] ? `marcha no lugar virado para ${DIR[m[3]]}${sp ? ` (${sp})` : ""}${n > 1 ? ` ×${n}` : ""}` : `anda ${x} para ${DIR[m[3]]}${sp ? ` (${sp})` : ""}`;
  }
  if ((m = a.match(/^Face(North|South|East|West)$/))) return `vira para ${DIR[m[1]]}`;
  if ((m = a.match(/^Jump(Near|Far|OnSpot)?(Slow|Normal|Fast|Faster)?(North|South|East|West)$/))) return `salta ${{ Near: "curto ", Far: "longo ", OnSpot: "no lugar ", undefined: "" }[m[1]] ?? ""}para ${DIR[m[3]]}${n > 1 ? ` ×${n}` : ""}`;
  if ((m = a.match(/^Delay(\d+)$/))) return `espera ${Number(m[1]) * n} quadros`;
  if (a.startsWith("Emote")) return `balão ${a.replace("Emote", "").replace("Mark", "")}`;
  const T = { LockDir: "trava a direção", UnlockDir: "destrava a direção", SetInvisible: "fica invisível", SetVisible: "fica visível", WarpIn: "entra por warp", PauseAnimation: "pausa a animação", ResumeAnimation: "retoma a animação" };
  return T[a] ? T[a] : `${a}${n > 1 ? ` ×${n}` : ""}`;
}
const COND = { 0: "<", 1: "==", 2: ">", 3: "<=", 4: ">=", 5: "!=" };
const VAR = { 32780: "resultado", 16384: "temp0", 16385: "temp1", 16386: "temp2", 32772: "arg0", 32773: "arg1" };
const v = (x) => (typeof x === "object" && x ? Object.values(x)[0] : x);
const vname = (x) => VAR[v(x)] ?? `var ${v(x)}`;

function renderMap(id) {
  const h = headers.get(id); const out = [];
  const name = SEC.get(h.mapsec) ?? "?";
  out.push(`\n## Mapa ${id} — ${name}\n`);
  out.push(`Música: dia ${au(h.musicDay)}, noite ${au(h.musicNight)}. Clima ${h.weather}. Script ${h.refs.scripts}, mensagens ${h.refs.messages}, encontros ${h.refs.encounters ?? "—"}.\n`);
  const evp = join(S, "events/events/maps", `${String(id).padStart(4, "0")}.json`);
  const ev = existsSync(evp) ? JSON.parse(readFileSync(evp, "utf8")) : { npcs: [], triggers: [], signs: [], warps: [] };
  const npc = new Map(ev.npcs.map((n) => [n.id, n]));
  const who = (p) => (p === 255 ? "Jogador" : p === 253 || p === 241 ? `Câmera (${p})` : npc.has(p) ? `NPC${p} [${sprite(npc.get(p).sprite)}]` : `objeto ${p}`);
  const entryOf = new Map(); const add = (e, d) => { if (e == null) return; entryOf.set(e, [...(entryOf.get(e) ?? []), d]); };
  out.push(`### Objetos\n`);
  for (const n of ev.npcs) {
    out.push(`- NPC${n.id}: sprite ${n.sprite} → ${sprite(n.sprite)}; posição (${n.x}, ${n.z}); virado ${["norte", "sul", "oeste", "leste"][n.facing] ?? n.facing}; movimento ${n.movement}${n.xRange || n.yRange ? ` (raio ${n.xRange}x${n.yRange})` : ""}; some com a flag ${n.hideFlag || "—"}${n.trainer ? `; ${trainer(Array.isArray(n.trainer) ? n.trainer[0] : n.trainer)}` : ""}`);
    if (n.script) add(n.script.entry, `falar com NPC${n.id} [${sprite(n.sprite)}] em (${n.x}, ${n.z})`);
  }
  for (const t of ev.triggers ?? []) { out.push(`- Gatilho de chão em (${t.x}, ${t.z}), ${t.w}x${t.h}, quando ${vname(t.variable)} == ${t.value}`); add(t.script.entry, `pisar em (${t.x}, ${t.z}) ${t.w}x${t.h} com ${vname(t.variable)} == ${t.value}`); }
  for (const s of ev.signs ?? []) if (s.script) add(s.script.entry, `ler placa/objeto em (${s.x}, ${s.z})`);
  const ls = ev.levelScripts ?? {};
  for (const k of ["onTransition", "onLoad", "onResume"]) if (ls[k]) add(ls[k].entry, `script de mapa (${k})`);
  for (const f of ls.frames ?? []) add(f.script.entry, `ao entrar/a cada quadro, quando ${vname(f.variable)} == ${f.value}`);
  const sp = join(S, "events/events/scripts", `${String(h.refs.scripts).padStart(4, "0")}.json`);
  if (!existsSync(sp)) return out.join("\n");
  const s = JSON.parse(readFileSync(sp, "utf8"));
  const label = new Map(Object.entries(s.labels).map(([k, i]) => [i, k]));
  const entryIndex = new Map(s.entries.map((l, i) => [l, i]));
  out.push(`\n### Script\n`);
  let last = "?"; let itemArg = null, countArg = 1;
  for (let i = 0; i < s.code.length; i++) {
    if (label.has(i)) {
      const l = label.get(i); const e = entryIndex.get(l);
      out.push(e != null ? `\n**${l} — entrada ${e}**${entryOf.has(e) ? `: ${entryOf.get(e).join("; ")}` : " (sem gatilho no mapa)"}` : `\n*${l}:*`);
    }
    const c = s.code[i];
    if (c.raw) { out.push(`  - comando bruto ${c.id}`); continue; }
    const a = c.args ?? {}; const n = c.name;
    const say = Object.values(a).filter((x) => x && typeof x === "object" && "text" in x).map((x) => x.text);
    const line = (t) => out.push(`  - ${t}`);
    if (say.length) { for (const r of say) { const [b, m] = r.split(":").map(Number); line(`${n === "NPCMsg" ? "fala" : n} (${r}): "${clean(txt(b, m))}"`); } continue; }
    switch (n) {
      case "GenderMsgBox": line(`fala por gênero: menino (${h.refs.messages}:${a.arg0}) "${clean(txt(h.refs.messages, a.arg0))}" / menina (${h.refs.messages}:${a.arg1}) "${clean(txt(h.refs.messages, a.arg1))}"`); break;
      case "ApplyMovement": { const mv = typeof a.movement === "object" ? a.movement.movement ?? a.movement.label : a.movement; line(`${who(a.arg0)}: ${(s.movements[mv] ?? []).map((x) => move(x.action, x.count)).join(", ")}`); break; }
      case "FacePlayer": line("vira para o jogador"); break;
      case "WaitButton": line("espera o botão"); break;
      case "PlaySE": line(`som ${au(a.arg0)}`); break;
      case "PlayCry": line(`grito de ${SPN.get(a.arg0) ?? a.arg0}`); break;
      case "PlayFanfare": line(`fanfarra ${au(v(a.fanfare))}`); break;
      case "PlayBGM": line(`toca música ${au(v(a.bgm))}`); break;
      case "StopBGM": line("para a música"); break;
      case "FadeScreen": line(a.direction === 0 ? "tela escurece" : "tela clareia"); break;
      case "SetFlag": line(`liga flag ${v(a.flag)}`); break;
      case "ClearFlag": line(`desliga flag ${v(a.flag)}`); break;
      case "CheckFlag": last = `flag ${v(a.flag)}`; break;
      case "CheckBadge": last = `tem a insígnia ${a.badge}`; break;
      case "CompareVarToValue": last = `${vname(a.var)} ? ${a.val}`; break;
      case "SetVar": if (v(a.var) === 32772) itemArg = a.val; if (v(a.var) === 32773) countArg = a.val; line(`${vname(a.var)} = ${a.val}`); break;
      case "AddVar": line(`${vname(a.var)} += ${v(a.var_or_addend)}`); break;
      case "GoTo": line(`vai para ${v(a.dest)}`); break;
      case "GoToIf": case "CallIf": {
        const cond = last.includes("?") ? last.replace("?", COND[a.condition] ?? `cond${a.condition}`) : `${last} ${a.condition === 1 ? "verdadeiro" : a.condition === 0 ? "falso" : `cond${a.condition}`}`;
        line(`se ${cond} → ${n === "CallIf" ? "chama" : "vai para"} ${v(a.dest ?? a.sub)}`); break;
      }
      case "Call": line(`chama ${v(a.sub)}`); break;
      case "CallStd": if ([2033, 2008].includes(a.id) && itemArg != null) line(`recebe ${countArg}× ${itemName(itemArg)} (item ${itemArg})`); else if (a.id === 2009) line("aviso de mochila cheia"); else line(`rotina padrão ${a.id}`); break;
      case "TrainerBattle": line(`luta: ${trainer(v(a.trainer))}`); break;
      case "MultiBattle": line(`luta dupla com aliado: ${trainer(a.arg0)} | contra ${trainer(a.arg1)} e ${trainer(a.arg2)}`); break;
      case "WildBattle": line(`luta selvagem: ${SPN.get(v(a.species)) ?? `(${vname(a.species)})`} nv. ${typeof v(a.level) === "number" && v(a.level) < 200 ? v(a.level) : `(${vname(a.level)})`}${a.shiny ? " shiny" : ""}`); break;
      case "GiveBadge": line(`recebe a insígnia ${a.badge}`); break;
      case "GiveMon": line(`recebe ${SPN.get(v(a.species)) ?? v(a.species)} nv. ${a.level}`); break;
      case "TakeItem": line(`perde ${itemName(a.arg0)} ×${a.arg1}`); break;
      case "HidePerson": line(`some: ${who(a.arg0)}`); break;
      case "ShowPerson": case "MakeObjectVisible": line(`aparece: ${who(a.arg0)}`); break;
      case "MovePersonFacing": line(`reposiciona ${who(a.person)} em (${a.x}, ${a.y}) virado ${a.facing}`); break;
      case "Warp": line(`teleporta para o mapa ${a.arg0} (${SEC.get(headers.get(a.arg0)?.mapsec) ?? "?"})`); break;
      case "HealParty": line("cura o time"); break;
      case "WhiteOut": line("derrota: volta ao último Centro"); break;
      case "End": line("fim"); break;
      case "Return": line("retorna"); break;
      case "GetMenuChoice": case "MenuExec": last = "escolha do menu ?"; line("espera a escolha"); break;
      case "LockAll": case "ReleaseAll": case "CloseMsg": case "WaitMovement": case "WaitFade": case "WaitCry": case "WaitFanfare": case "WaitSE": case "TouchscreenMenuHide": case "TouchscreenMenuShow": case "ToggleFollowingPokemonMovement": case "WaitFollowingPokemonMovement": break;
      default: line(`${n} ${Object.entries(a).map(([k, x]) => `${k}=${JSON.stringify(v(x))}`).join(" ")}`);
    }
  }
  return out.join("\n");
}

const plan = JSON.parse(readFileSync(join(root, "content/roadmap/map-blocks.json"), "utf8"));
const blocks = (arg("--blocks") ?? "").split(",").filter(Boolean);
const extra = (arg("--maps") ?? "").split(",").filter(Boolean).map(Number);
const ids = new Set(extra);
for (const h of headers.values()) {
  const a = plan.maps?.[String(h.id)] ?? plan.sections[SEC.get(h.mapsec)];
  if (typeof a === "string" && blocks.includes(a)) ids.add(h.id);
}
const name = arg("--name") ?? (blocks.join("-") || "mapas");
const dir = join(root, ".evidence/roteiro"); mkdirSync(dir, { recursive: true });
const body = [`# Roteiro detalhado: ${name}\n`, "Gerado de assets/stages pela extração local. Contém texto do jogo: não versionar.\n", ...[...ids].sort((x, y) => x - y).map(renderMap)].join("\n");
writeFileSync(join(dir, `${name}.md`), body);
console.log(`${join(dir, `${name}.md`)}: ${ids.size} mapas, ${body.length} caracteres`);
