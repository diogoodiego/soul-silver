import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 024 edge case: a save made in the middle of a scene keeps the state from before it, as the original
// never saves mid-script. Found on the real ROM: an autosave between Mr. Pokémon's egg and the end of his
// scene stored the egg without the scene's variables, so the scene ran again on load and gave a second egg.

const scene = scriptFile(100, ["L1:", ["SetFlag", { flag: { flag: 320 } }], ["NPCMsg", { msg_id: { text: "0007:1" } }], ["SetFlag", { flag: { flag: 321 } }], ["End"]]);
const data = () => scriptData([scene], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) });

describe("saves during a script", () => {
  it("autosaves in the middle of a scene keep the state from before it; the next save after it has the scene", () => {
    const t = story(data());
    const a = t.connect();
    t.step();
    t.press(a);
    // Waits on the message past an autosave interval, the client sending input as a real one does.
    t.walk(a, { x: 0, y: 0 }, 650);
    const mid = a.saves().at(-1)!.save;
    expect(mid.flags).not.toContain(320);
    a.conn.send({ type: "script-answer", id: 1 });
    t.walk(a, { x: 0, y: 0 }, 650);
    expect(a.saves().at(-1)!.save.flags).toEqual(expect.arrayContaining([320, 321]));
    expect(a.saves().at(-1)!.save.rev).toBeGreaterThan(mid.rev);
  });

  it("closing in the middle of a scene saves the state from before it", () => {
    const t = story(data());
    const a = t.connect();
    t.step();
    t.press(a);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.flags).not.toContain(320);
  });
});
