<script lang="ts">
  // The capture cutscene (developer's storyboard), one continuous shot: a line cuts the screen in the middle and
  // opens into a band; on its black the 3D Poké Ball flies into the Pokémon's battle sprite, bounces off onto the
  // ground that shows up under it, opens on its hinge and draws the Pokémon in as red particles, closes; the daylight dies, the camera
  // comes in, and a single theatre spotlight from above holds the ball while it rocks once per shake. The game
  // keeps running around the band.
  import { onMount } from "svelte";
  import {
    AdditiveBlending,
    AmbientLight,
    BufferAttribute,
    BufferGeometry,
    CanvasTexture,
    CircleGeometry,
    Color,
    ConeGeometry,
    DirectionalLight,
    DoubleSide,
    HemisphereLight,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    NearestFilter,
    PerspectiveCamera,
    PlaneGeometry,
    Points,
    PointsMaterial,
    Scene,
    SpotLight,
    SRGBColorSpace,
    Texture,
    Vector3,
    WebGLRenderer,
  } from "three";
  import { createPokeBall, LID_OPEN, poseFlight, poseShakes, setLid } from "../render/poke-ball";
  import { loadBitmap } from "../render/map-assets";
  import { cutscenePhase, type CutsceneStep } from "./capture-cutscene";
  import { pokemonFronts } from "./game-data";

  let {
    species,
    result,
    shakeMs,
    onDone,
  }: {
    species: number;
    /** The server's roll; undefined until the ball hits. */
    result: { shakes: number; caught: boolean } | undefined;
    shakeMs: number;
    onDone: () => void;
  } = $props();

  /** The band's open height, as a share of the screen height. */
  const BAND = 0.42;
  const BALL_SCALE = 3;
  /** The ball's centre over its ground point. */
  const BALL_C = 13;
  /** The band's black, behind everything. */
  const DARK = new Color(0x000000);
  const MON_X = 90;
  /** Where the ball lands after bouncing off the Pokémon. */
  const LAND = new Vector3(MON_X - 75, 0, 18);
  const FROM = new Vector3(-360, 70, 10);
  /** The ball settles turned a little towards the Pokémon. */
  const FACE = 0.45;
  const CAM_FROM = { pos: new Vector3(0, 80, 470), look: new Vector3(0, 45, 0) };
  const CAM_TO = { pos: new Vector3(LAND.x - 10, 70, 230), look: new Vector3(LAND.x, 14, 0) };
  const SPOT_HEIGHT = 420;
  const SPOT_ANGLE = 0.24;
  const PARTICLES = 320;
  const GROUND_RADIUS = 260;
  /** Past the last shake, so the result's button colour holds while the band closes. */
  const RESULT_HOLD = 1000;

  const ORDER: CutsceneStep[] = ["line", "open", "throw", "wait", "bounce", "lid-open", "absorb", "lid-close", "dim", "shake", "result", "close", "done"];
  const smooth = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  const easeOut = (k: number) => 1 - (1 - k) ** 3;

  let band: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  onMount(() => {
    const w = window.innerWidth;
    const h = Math.round(window.innerHeight * BAND);
    const renderer = new WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h, false);
    renderer.shadowMap.enabled = true;
    const scene = new Scene();
    // The band's own black: no scenery until the ball comes down.
    scene.background = DARK;
    const camera = new PerspectiveCamera(30, w / h, 1, 4000);

    // Light on the ball and the Pokémon; it dies to the spotlight.
    const hemi = new HemisphereLight(0xffffff, 0x446633, 1.6);
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(-1, 2, 2);
    scene.add(hemi, sun, new AmbientLight(0xffffff, 0.04));
    // The ground shows up where the ball lands: a disc of grass fading out into the black at its edge.
    const fade = document.createElement("canvas");
    fade.width = fade.height = 128;
    const fadeCtx = fade.getContext("2d")!;
    const gradient = fadeCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0.35, "#fff");
    gradient.addColorStop(1, "#000");
    fadeCtx.fillStyle = gradient;
    fadeCtx.fillRect(0, 0, 128, 128);
    const groundFade = new CanvasTexture(fade);
    const groundMaterial = new MeshStandardMaterial({ color: 0x4f8a3e, roughness: 1, transparent: true, opacity: 0, alphaMap: groundFade, depthWrite: false });
    const ground = new Mesh(new CircleGeometry(GROUND_RADIUS, 64), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(LAND.x, 0, LAND.z);
    ground.receiveShadow = true;
    scene.add(ground);
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    // The theatre spotlight and its visible beam.
    const spot = new SpotLight(0xfff1d0, 0, 0, SPOT_ANGLE, 0.55, 2);
    spot.position.set(LAND.x, SPOT_HEIGHT, LAND.z);
    spot.target.position.copy(LAND);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    scene.add(spot, spot.target);
    const beamMaterial = new MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const beam = new Mesh(new ConeGeometry(SPOT_HEIGHT * Math.tan(SPOT_ANGLE), SPOT_HEIGHT, 40, 1, true), beamMaterial);
    beam.position.set(LAND.x, SPOT_HEIGHT / 2, LAND.z);
    scene.add(beam);

    const ball = createPokeBall();
    ball.root.scale.setScalar(BALL_SCALE);
    ball.root.visible = false;
    scene.add(ball.root);
    const tilt = ball.root.getObjectByName("tilt")!;
    const body = ball.root.getObjectByName("body")!;

    // The Pokémon: its battle sprite, standing where the ground will show up.
    const monMaterial = new MeshBasicMaterial({ transparent: true, alphaTest: 0.05, depthWrite: false });
    const mon = new Mesh(new PlaneGeometry(1, 1), monMaterial);
    mon.visible = false;
    scene.add(mon);
    let monW = 96;
    let monH = 96;

    // The red particles: each starts on one of the sprite's pixels and curves into the open ball.
    const starts = new Float32Array(PARTICLES * 3);
    const bends = new Float32Array(PARTICLES * 3);
    const delays = new Float32Array(PARTICLES);
    const positions = new Float32Array(PARTICLES * 3);
    const dotsGeometry = new BufferGeometry();
    dotsGeometry.setAttribute("position", new BufferAttribute(positions, 3));
    const dotsMaterial = new PointsMaterial({ color: 0xff2a2a, size: 5, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    const dots = new Points(dotsGeometry, dotsMaterial);
    dots.frustumCulled = false;
    scene.add(dots);
    const seedParticles = (pixels: [number, number][], fw: number, fh: number) => {
      for (let i = 0; i < PARTICLES; i++) {
        const [px, py] = pixels.length > 0 ? pixels[Math.floor(rand() * pixels.length)]! : [rand() * fw, rand() * fh];
        starts.set([MON_X + (px / fw - 0.5) * monW, (1 - py / fh) * monH, 2], i * 3);
        bends.set([(rand() - 0.5) * 60, 50 + rand() * 70, (rand() - 0.5) * 50], i * 3);
        delays[i] = rand() * 0.45;
      }
    };
    seedParticles([], 1, 1);

    void pokemonFronts().then(async (fronts) => {
      const frame = fronts.get(species);
      const bitmap = frame && (await loadBitmap(frame.url));
      if (!frame || !bitmap) return;
      const texture = new Texture(bitmap);
      texture.magFilter = NearestFilter;
      texture.minFilter = NearestFilter;
      texture.colorSpace = SRGBColorSpace;
      // An ImageBitmap uploads unflipped: v grows downwards from the page's top row.
      texture.repeat.set(frame.w / bitmap.width, -frame.h / bitmap.height);
      texture.offset.set(frame.x / bitmap.width, (frame.y + frame.h) / bitmap.height);
      texture.needsUpdate = true;
      monMaterial.map = texture;
      monMaterial.needsUpdate = true;
      monW = frame.w * 1.4;
      monH = frame.h * 1.4;
      // The particles start on the sprite's own opaque pixels, so they come off in its shape.
      const cut = new OffscreenCanvas(frame.w, frame.h).getContext("2d");
      const pixels: [number, number][] = [];
      if (cut) {
        cut.drawImage(bitmap, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
        const data = cut.getImageData(0, 0, frame.w, frame.h).data;
        for (let y = 0; y < frame.h; y++) for (let x = 0; x < frame.w; x++) if (data[(y * frame.w + x) * 4 + 3]! > 0) pixels.push([x, y]);
      }
      seedParticles(pixels, frame.w, frame.h);
      mon.visible = true;
    });

    const hitPoint = () => new Vector3(MON_X - monW * 0.12, monH * 0.55, 10);
    const start = performance.now();
    let resultAt: number | undefined;
    let spinAtHit: number | undefined;
    const at = new Vector3();
    const bezier = (a: Vector3, b: Vector3, c: Vector3, u: number) =>
      at.set(0, 0, 0).addScaledVector(a, (1 - u) ** 2).addScaledVector(b, 2 * (1 - u) * u).addScaledVector(c, u * u);
    const mouth = LAND.clone().setY(BALL_C * 1.15);
    const from = new Vector3();
    const bend = new Vector3();

    let frame = requestAnimationFrame(function draw(now) {
      const t = now - start;
      const shakes = result?.shakes ?? 0;
      const p = cutscenePhase(t, resultAt, shakes, shakeMs);
      if (p.name === "wait" && result) resultAt = t;
      // The band: a line growing across, opening, and closing at the end.
      const open = p.name === "line" ? 0 : p.name === "open" ? easeOut(p.k) : p.name === "close" ? 1 - easeOut(p.k) : 1;
      band.style.width = `${(p.name === "line" ? easeOut(p.k) : 1) * 100}%`;
      band.style.height = `${Math.max(2, open * h)}px`;
      if (p.name === "done") {
        onDone();
        return;
      }
      const idx = ORDER.indexOf(p.name);
      const prog = (name: CutsceneStep) => (p.name === name ? p.k : idx > ORDER.indexOf(name) ? 1 : 0);
      const escaped = result?.caught === false && (p.name === "result" || p.name === "close");
      const escape = escaped ? (p.name === "close" ? 1 : p.k) : 0;

      // The ball: thrown in an arc, held against the Pokémon until the result, bounced back onto the ground.
      ball.root.visible = idx >= ORDER.indexOf("throw");
      const hit = hitPoint();
      if (idx <= ORDER.indexOf("wait")) {
        const k = prog("throw");
        const centre = FROM.clone().lerp(hit, k);
        centre.y += Math.sin(Math.PI * k) * 80;
        ball.root.position.set(centre.x, centre.y - BALL_C, centre.z);
        poseFlight(ball, t, Math.PI / 2);
      } else {
        spinAtHit ??= body.rotation.x;
        const k = prog("bounce");
        // A long arc back off the Pokémon, then a small hop where it lands.
        const main = Math.min(1, k / 0.75);
        const hop = k > 0.75 ? Math.sin(((k - 0.75) / 0.25) * Math.PI) * 7 : 0;
        const x = hit.x + (LAND.x - hit.x) * easeOut(main);
        const z = hit.z + (LAND.z - hit.z) * main;
        const y = hit.y + (BALL_C - hit.y) * main * main + Math.sin(Math.PI * main) * 45 + hop;
        ball.root.position.set(x, y - BALL_C, z);
        // The spin runs down to upright, a turn and a bit past where it hit.
        const rest = Math.ceil(spinAtHit / (Math.PI * 2)) * Math.PI * 2 + Math.PI * 2;
        body.rotation.x = spinAtHit + (rest - spinAtHit) * easeOut(k);
        tilt.rotation.set(0, Math.PI / 2 + (FACE - Math.PI / 2) * easeOut(k), 0);
      }
      // The lid: open to draw the Pokémon in, shut, and thrown open again when it breaks free.
      const lid = p.name === "lid-open" ? easeOut(p.k) : p.name === "absorb" ? 1 : p.name === "lid-close" ? 1 - p.k * p.k : escaped ? Math.min(1, escape * 6) : 0;
      setLid(ball, lid * LID_OPEN);
      if (p.name === "shake") poseShakes(ball, p.ms, shakes, shakeMs, result?.caught);
      else if (p.name === "result" || p.name === "close") poseShakes(ball, shakes * shakeMs + (p.name === "close" ? RESULT_HOLD : p.ms), shakes, shakeMs, escaped ? undefined : result?.caught);
      else poseShakes(ball, 0, 0, shakeMs, undefined);

      // The Pokémon goes red and comes apart into particles that curve into the ball (backwards when it escapes).
      const absorb = escaped ? 1 - smooth(0.1, 0.8, escape) : prog("absorb");
      const knock = p.name === "bounce" ? Math.sin(p.ms / 18) * 5 * (1 - p.k) : 0;
      mon.position.set(MON_X + knock, monH / 2, 0);
      mon.scale.set(monW, monH, 1);
      monMaterial.color.setRGB(1, 1 - 0.8 * smooth(0, 0.25, absorb), 1 - 0.8 * smooth(0, 0.25, absorb));
      monMaterial.opacity = 1 - smooth(0.12, 0.5, absorb);
      const flying = absorb > 0 && absorb < 1;
      dotsMaterial.opacity = flying ? 1 - smooth(0.85, 1, absorb) : 0;
      if (flying) {
        for (let i = 0; i < PARTICLES; i++) {
          const u = smooth(0, 1, (absorb - delays[i]!) / 0.55);
          from.fromArray(starts, i * 3);
          bend.fromArray(bends, i * 3).addScaledVector(from, 0.5).addScaledVector(mouth, 0.5);
          bezier(from, bend, mouth, u).toArray(positions, i * 3);
        }
        dotsGeometry.attributes["position"]!.needsUpdate = true;
      }

      // The lights: the day goes out, a beat of dark, then the spotlight comes on over the ball.
      const dim = prog("dim");
      const day = 1 - smooth(0, 0.55, dim);
      const lit = smooth(0.5, 1, dim);
      hemi.intensity = 1.6 * day;
      sun.intensity = 1.6 * day;
      groundMaterial.opacity = smooth(0.55, 0.9, prog("bounce"));
      spot.intensity = 700000 * lit;
      beamMaterial.opacity = 0.09 * lit;
      // The camera comes in on the ball through the absorb and the dark.
      const cam = 0.35 * smooth(0, 1, prog("absorb")) + 0.65 * smooth(0, 1, dim);
      camera.position.lerpVectors(CAM_FROM.pos, CAM_TO.pos, cam);
      camera.lookAt(at.lerpVectors(CAM_FROM.look, CAM_TO.look, cam));
      mon.quaternion.copy(camera.quaternion);

      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    });

    return () => {
      cancelAnimationFrame(frame);
      ball.dispose();
      scene.traverse((o) => {
        if (o instanceof Mesh || o instanceof Points) (o.geometry as BufferGeometry).dispose();
      });
      monMaterial.map?.dispose();
      for (const m of [groundMaterial, beamMaterial, monMaterial, dotsMaterial]) m.dispose();
      groundFade.dispose();
      renderer.dispose();
    };
  });
</script>

<div class="pointer-events-none fixed inset-0 z-6 grid place-items-center" aria-hidden="true">
  <div bind:this={band} class="relative overflow-hidden border-y-2 border-white bg-black" style:width="0%" style:height="2px">
    <canvas bind:this={canvas} class="absolute left-1/2 top-1/2 h-[42vh] w-screen -translate-x-1/2 -translate-y-1/2"></canvas>
  </div>
</div>
