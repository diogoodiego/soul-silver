import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 024: Elm's lab's onResume places the starter balls; it runs on entering the map and again
// once the starter scene's script ends, as the field reloads after it in the original.

const lab = scriptFile(100, [
  "L1:",
  ["ChooseStarter"],
  ["SetFlag", { flag: { flag: 0x99 } }],
  ["End"],
  "L2:",
  ["PlaceStarterBallsInElmsLab"],
  ["End"],
]);
const data = () => scriptData([lab], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)], levelScripts: { onTransition: null, onLoad: null, onResume: { id: 2, file: 100, entry: 1 }, frames: [] } }) });

describe("starter balls", () => {
  it("are placed on entry and placed again after the starter scene", () => {
    const t = story(data());
    const a = t.connect();
    t.step();
    t.press(a);
    const starter = t.of(a, "script").find((m) => m.request.kind === "starter")!;
    a.conn.send({ type: "script-answer", id: starter.id, answer: 1 });
    t.step(2);
    const placed = t.of(a, "script-event").flatMap((m) => (m.event.kind === "props" ? [`${m.event.area}:${m.event.props.length}`] : []));
    expect(placed).toEqual(["60:3", "60:1"]);
  });
});
