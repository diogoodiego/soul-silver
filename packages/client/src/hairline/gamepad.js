/**
 * Gamepad: an Xbox-layout controller lying on the desk, held in an unseen pair
 * of hands. One shell, wide shoulders and two grips splaying down from them,
 * with the offset sticks, the D-pad, the face diamond and the guide button. It
 * tilts toward the pointer on two springs; the control nearest the pointer
 * sinks on the 700ms lift curve and takes the bright stroke, and its action
 * goes to the read-out. At rest A is lit. The slider is the tilt, in degrees.
 *
 * The pattern: one of many, chosen by distance to each control's rest centre
 * on screen (rule 01), over a whole that leans on springs (rule 08).
 */
const {
  Cam, circ, clamp, facing, fillet, fit, open, poly, prism, proj, rad, rings, unproj, spring, stepS,
  tdone, tset, tval, tween, mk, pointer, put, register, disposer, solid,
} = HL;

const TOP = 10, PRESS = 1.6, REACH = 22, H = Math.SQRT1_2, B = 2.2;
/** Pad space (u across, v toward the player) to the ground: turned 45° so the pad faces the viewer. */
const W = (u, v) => [(u + v) * H, (v - u) * H];
const turn = (ring) => ring.map((q) => ({ ...q, u: (q.u + q.v) * H, v: (q.v - q.u) * H, nu: (q.nu + q.nv) * H, nv: (q.nv - q.nu) * H }));
/** The shell seen from above, clockwise from the left shoulder: grips splay out and down, a notch between them. */
const SHELL = fillet(
  [[-44, -26], [44, -26], [58, -16], [65, 4], [68, 26], [63, 41], [52, 47], [41, 42], [30, 26], [18, 19], [-18, 19], [-30, 26], [-41, 42], [-52, 47], [-63, 41], [-68, 26], [-65, 4], [-58, -16]],
  [12, 12, 12, 16, 14, 10, 10, 10, 12, 10, 10, 12, 10, 10, 10, 14, 16, 12], 5,
);
/** The shell's crease: its outline moved b inwards along each point's normal. */
const INNER = SHELL.map((p, i) => {
  const a = SHELL[(i + SHELL.length - 1) % SHELL.length], c = SHELL[(i + 1) % SHELL.length];
  const tx = c[0] - a[0], ty = c[1] - a[1], l = Math.hypot(tx, ty) || 1;
  return [p[0] - (ty / l) * B, p[1] + (tx / l) * B];
});
/** Controls on the face, [id, u, v, radius, height]; the D-pad draws its own cross. */
const FACE = [
  ["guide", 0, -16, 4.2, 1], ["view", -10, -6, 2.4, 1.2], ["start", 10, -6, 2.4, 1.2],
  ["ls", -36, -8, 7, 6], ["y", 36, -16, 3.6, 3], ["x", 29, -9, 3.6, 3], ["b", 43, -9, 3.6, 3],
  ["a", 36, -2, 3.6, 3], ["dpad", -18, 10, null, 2.4], ["rs", 18, 10, 7, 6],
];
/** Behind the shell: triggers, then bumpers along the shoulders, [id, box, z0, z1, centre]. */
const BACK = [
  ["lt", [-52, -44, -32, -32], 3, 12, [-42, -38, 12]], ["rt", [32, -44, 52, -32], 3, 12, [42, -38, 12]],
  ["lb", [-58, -33, -24, -25], 4, 9, [-40, -29, 9]], ["rb", [24, -33, 58, -25], 4, 9, [40, -29, 9]],
];
const LABELS = { a: "A · confirm", b: "B · back", x: "X · move 2", y: "Y · move 3", lb: "LB · prev tab", rb: "RB · next tab", lt: "LT · combat", rt: "RT · recall", ls: "LS · walk", rs: "RS · rod", dpad: "D-pad · directions", view: "View · picker", start: "Start · menu", guide: "Guide · none" };

/** A closed outline's two chains between its leftmost and rightmost points, upper first, each left to right. */
function chains(pts) {
  let lo = 0, hi = 0;
  pts.forEach((p, i) => { if (p[0] < pts[lo][0]) lo = i; if (p[0] > pts[hi][0]) hi = i; });
  const walk = (from, to) => { const out = []; for (let i = from; ; i = (i + 1) % pts.length) { out.push(pts[i]); if (i === to) return out; } };
  const a = walk(lo, hi), b = walk(hi, lo).reverse();
  const mean = (c) => c.reduce((s, p) => s + p[1], 0) / c.length;
  return mean(a) < mean(b) ? [a, b] : [b, a];
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const C = Cam(45, 0.5, 2.5);
  fit(C, [[...W(-70, -46), -12], [...W(70, 48), -12], [...W(70, -46), 24], [...W(-70, 48), 24]], 200, 166);
  const P0 = proj(C), front = facing(C);
  let T = rad(value);
  const labels = stage.dataset && stage.dataset.labels ? JSON.parse(stage.dataset.labels) : LABELS;

  // The whole pad leans in its own space: a turn about v (a, lifts +u) then about u (b, lifts +v), round its middle.
  const ta = spring(0), tb = spring(0);
  const P = (x, y, z) => {
    const u = (x - y) * H, v = (x + y) * H;
    const ca = Math.cos(ta.x), sa = Math.sin(ta.x), cb = Math.cos(tb.x), sb = Math.sin(tb.x);
    const z0 = z - 5, u1 = u * ca - z0 * sa, z1 = z0 * ca + u * sa;
    return P0(...W(u1, v * cb - z1 * sb), z1 * cb + v * sb + 5);
  };
  const PL = (u, v, z) => P(...W(u, v), z);

  const g = mk("g", {}, svg), parts = [];
  function part(id, foot, z0, z1, r, b, at) {
    const [ring, inner] = Array.isArray(foot) ? rings(foot[0], foot[1], foot[2], foot[3], r, b)
      : [circ(foot, 16).map((q) => ({ ...q, u: q.u + at[0], v: q.v + at[1] })), circ(foot - b, 16).map((q) => ({ ...q, u: q.u + at[0], v: q.v + at[1] }))];
    parts.push({ id, ring: turn(ring), inner: turn(inner), z0, z1, el: solid(g), press: tween(0) });
  }
  // Back to front (v grows toward the viewer): triggers and bumpers, the shell, then the face.
  for (const [id, box, z0, z1] of BACK) part(id, box, z0, z1, id[1] === "t" ? 4 : 3, 1);
  const shell = solid(g);
  for (const [id, u, v, foot, h] of FACE.slice().sort((p, q) => p[2] - q[2])) {
    if (id === "dpad") { part(id, [-25, 8, -11, 12.4], TOP, TOP + h, 1.6, 0.6); part(id, [-20.2, 3, -15.8, 17.4], TOP, TOP + h, 1.6, 0.6); }
    else part(id, foot, TOP, TOP + h, 0, foot > 4.5 ? 1.4 : 0.8, [u, v]);
  }

  /** The shell has a notch, so no hull: its top's upper chain, then its foot's lower chain, back to the start. */
  function drawShell() {
    const [up] = chains(SHELL.map(([u, v]) => PL(u, v, TOP)));
    const [, down] = chains(SHELL.map(([u, v]) => PL(u, v, 0)));
    const [, crease] = chains(INNER.map(([u, v]) => PL(u, v, TOP)));
    put(shell, { sil: poly([...up, ...down.slice().reverse()]), crease: open(crease) });
  }

  // Hit targets and label anchors: each control's rest centre on screen, with the pad flat. They never move (rule 01).
  const centres = [...FACE.map(([id, u, v, , h]) => [id, u, v, TOP + h]), ...BACK.map(([id, , , , c]) => [id, ...c])]
    .map(([id, u, v, z]) => ({ id, s: P0(...W(u, v), z) }));
  function nearest([sx, sy]) {
    let best = null, d = REACH;
    for (const c of centres) { const e = Math.hypot(c.s[0] - sx, c.s[1] - sy); if (e < d) { d = e; best = c.id; } }
    return best;
  }

  const L = register(stage, (dt, now) => {
    let m = stepS(ta, dt);
    if (stepS(tb, dt)) m = true;
    drawShell();
    for (const p of parts) {
      const d = tval(p.press, now);
      if (!tdone(p.press, now)) m = true;
      put(p.el, prism(P, front, p.ring, p.inner, p.z0, Math.max(p.z0 + 0.4, p.z1 - d)));
    }
    return m;
  });
  bag.add(L.unregister);

  let act;
  /** Lights and presses one control (`a` at rest) and names it. */
  function choose(id) {
    if (id === act) return;
    act = id;
    const now = performance.now();
    for (const p of parts) {
      tset(p.press, p.id === id ? PRESS : 0, now, 0);
      p.el.sil.classList.toggle("hi", p.id === (id || "a"));
    }
    read.textContent = id ? labels[id] || id : "rest";
    L.wake();
  }
  function lean(at) {
    ta.t = at ? clamp(at[0] / 68, -1, 1) * T : -0.2 * T;
    tb.t = at ? clamp(at[1] / 46, -1, 1) * T : 0.25 * T;
    L.wake();
  }
  lean(null);
  choose(null);

  bag.add(pointer(stage, {
    move: (p) => { const [x, y] = unproj(C, p[0], p[1], 0); lean([(x - y) * H, (x + y) * H]); choose(nearest(p)); },
    leave: () => { lean(null); choose(null); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { T = rad(v); lean(null); },
    /** A real pad's press: lean toward that control and light it, as the pointer would; null lets go. */
    pick: (id) => {
      const f = FACE.find((c) => c[0] === id), b = BACK.find((c) => c[0] === id);
      lean(f ? [f[1], f[2]] : b ? [b[4][0], b[4][1]] : null);
      choose(f || b ? id : null);
    },
    /** Where each control sits at rest, in viewBox units: for labels drawn outside the figure. */
    anchors: () => Object.fromEntries(centres.map((c) => [c.id, c.s])),
    destroy: bag.dispose,
  };
}

hairline({
  name: "gamepad",
  means: "A controller in the hands: it turns toward the pointer, and the control nearest it sinks and names its action.",
  rules: [1, 4, 5, 8],
  range: [3, 6, 10],
  tour: [[294, 148], [110, 134], [300, 112], null],
  mount,
});
