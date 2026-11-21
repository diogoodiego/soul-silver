import type { AppSettings } from "@soulsilver/shared";
import { NearestFilter, Vector2, Vector4, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// HD-2D post-processing (item V.1): the scene is drawn at the native view size, upscaled with nearest
// filtering to the canvas, which is the size of the screen, and the effects run there, so the pixels
// stay crisp under a smooth blur and glow. Shaders skip the colorspace include: the ROM colors go out as they are.

type Visual = AppSettings["visual"];

const VERTEX = "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";

/** Value noise and a 4-octave sum of it, in [0, 1]. */
const NOISE = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v / 0.9375; }
`;

/**
 * The native frame, nearest-sampled, under drifting cloud shadows (anchored to the map, so they slide by as
 * the camera moves) and a haze thickening toward the top of the screen (the far side of the map).
 */
const UPSCALE_FOG = {
  uniforms: { tScene: { value: null }, fog: { value: 0 }, clouds: { value: 0 }, view: { value: new Vector4() }, time: { value: 0 } },
  vertexShader: VERTEX,
  fragmentShader: `
    uniform sampler2D tScene; uniform float fog; uniform float clouds; uniform vec4 view; uniform float time; varying vec2 vUv;
    ${NOISE}
    void main() {
      vec3 c = texture2D(tScene, vUv).rgb;
      if (clouds > 0.0) {
        // Map pixels under this one (height ignored): the view's top left plus the way down the screen.
        vec2 world = view.xy + vec2(vUv.x, 1.0 - vUv.y) * view.zw;
        float n = fbm((world - vec2(14.0, 6.0) * time) / 260.0);
        c *= 1.0 - clouds * smoothstep(0.52, 0.72, n);
      }
      gl_FragColor = vec4(mix(c, vec3(0.86, 0.9, 0.96), fog * smoothstep(0.5, 1.0, vUv.y)), 1.0);
    }`,
};

/** Sun shafts fanning down from above the top of the screen, swaying slowly; screen-blended so whites never clip. */
const GOD_RAYS = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0 }, aspect: { value: 1 }, time: { value: 0 } },
  vertexShader: VERTEX,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float amount; uniform float aspect; uniform float time; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // The sun above the top left, the way the shadows fall.
      vec2 d = (vUv - vec2(0.2, 1.45)) * vec2(aspect, 1.0);
      float a = atan(d.x, -d.y);
      float beams = (0.5 + 0.5 * sin(a * 29.0 + time * 0.9)) * (0.5 + 0.5 * sin(a * 47.0 - time * 0.7 + 1.3)) * (0.6 + 0.4 * sin(a * 11.0 + time * 0.35));
      float fade = smoothstep(0.15, 1.0, vUv.y) * (1.0 - smoothstep(0.4, 1.6, length(d)));
      vec3 light = vec3(1.0, 0.94, 0.78) * amount * pow(beams, 1.6) * fade;
      gl_FragColor = vec4(1.0 - (1.0 - c) * (1.0 - light), 1.0);
    }`,
};

/** One axis of a gaussian whose radius grows with the distance from the sharp band around the player. */
const tiltShift = (taps: number) => ({
  uniforms: { tDiffuse: { value: null }, texel: { value: new Vector2() }, dir: { value: new Vector2() }, focusY: { value: 0.5 }, amount: { value: 0 } },
  vertexShader: VERTEX,
  fragmentShader: `
    #define TAPS ${taps}
    uniform sampler2D tDiffuse; uniform vec2 texel; uniform vec2 dir; uniform float focusY; uniform float amount; varying vec2 vUv;
    void main() {
      float r = amount * smoothstep(0.0, 0.4, abs(vUv.y - focusY) - 0.1);
      vec4 sum = vec4(0.0); float total = 0.0;
      for (int i = -TAPS; i <= TAPS; i++) {
        float t = float(i) / float(TAPS); float w = exp(-2.0 * t * t);
        sum += texture2D(tDiffuse, vUv + dir * texel * r * t) * w; total += w;
      }
      gl_FragColor = sum / total;
    }`,
});

const VIGNETTE = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0 } },
  vertexShader: VERTEX,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      gl_FragColor = vec4(c * (1.0 - vignette * smoothstep(0.3, 0.75, length(vUv - 0.5))), 1.0);
    }`,
};

/** Strength 100 maps to these. */
// Bloom was far too strong: 100% is now what 10% was.
const MAX = { fog: 0.6, bloom: 0.08, blurPx: 6, vignette: 0.7, godRays: 0.35, clouds: 0.3 };

/** What the sky effects need: the sun (0 night, 1 day), the view in map pixels and a clock for the drift. */
export interface Sky {
  daylight: number;
  left: number;
  top: number;
  seconds: number;
}
const BLOOM_RADIUS = 0.4;
/** Only bright ROM colors glow: the art is low contrast, so a lower threshold washes the whole map. */
const BLOOM_THRESHOLD = 0.7;

export function createPost(renderer: WebGLRenderer, quality: Exclude<Visual["quality"], "off">) {
  const native = new WebGLRenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter });
  const composer = new EffectComposer(renderer);
  const upscale = new ShaderPass(UPSCALE_FOG, "tUnused");
  upscale.uniforms["tScene"]!.value = native.texture;
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0, BLOOM_RADIUS, BLOOM_THRESHOLD);
  const taps = quality === "high" ? 8 : 4;
  const blurX = new ShaderPass(tiltShift(taps));
  const blurY = new ShaderPass(tiltShift(taps));
  (blurX.uniforms["dir"]!.value as Vector2).set(1, 0);
  (blurY.uniforms["dir"]!.value as Vector2).set(0, 1);
  const rays = new ShaderPass(GOD_RAYS);
  const vignette = new ShaderPass(VIGNETTE);
  for (const pass of [upscale, bloom, rays, blurX, blurY, vignette]) composer.addPass(pass);
  let scale = 1;
  let native2 = { w: 1, h: 1 };

  return {
    /** Native view size and the whole-number scale to the canvas. */
    setSize(w: number, h: number, s: number): void {
      scale = s;
      native2 = { w, h };
      rays.uniforms["aspect"]!.value = w / h;
      native.setSize(w, h);
      composer.setSize(w * s, h * s);
      // Low quality: the glow is computed at half the resolution again.
      if (quality === "low") bloom.setSize((w * s) / 2, (h * s) / 2);
      for (const blur of [blurX, blurY]) (blur.uniforms["texel"]!.value as Vector2).set(1 / (w * s), 1 / (h * s));
    },
    /** `focusY`: the player's height on the screen, 0 at the top and 1 at the bottom. `sky`: none indoors. */
    render(scene: Scene, camera: Camera, visual: Visual, focusY: number, outdoor: boolean, sky?: Sky): void {
      renderer.setRenderTarget(native);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      upscale.uniforms["fog"]!.value = outdoor ? (visual.fog / 100) * MAX.fog : 0;
      const sun = outdoor && sky ? sky.daylight : 0;
      upscale.uniforms["clouds"]!.value = (visual.clouds / 100) * MAX.clouds * sun;
      rays.enabled = visual.godRays > 0 && sun > 0;
      rays.uniforms["amount"]!.value = (visual.godRays / 100) * MAX.godRays * sun;
      if (sky) {
        (upscale.uniforms["view"]!.value as Vector4).set(sky.left, sky.top, native2.w, native2.h);
        upscale.uniforms["time"]!.value = rays.uniforms["time"]!.value = sky.seconds;
      }
      bloom.enabled = visual.bloom > 0;
      bloom.strength = (visual.bloom / 100) * MAX.bloom;
      for (const blur of [blurX, blurY]) {
        blur.enabled = visual.tiltShift > 0;
        blur.uniforms["focusY"]!.value = 1 - focusY;
        blur.uniforms["amount"]!.value = (visual.tiltShift / 100) * MAX.blurPx * scale;
      }
      vignette.uniforms["vignette"]!.value = (visual.vignette / 100) * MAX.vignette;
      composer.render();
    },
    dispose(): void {
      native.dispose();
      composer.dispose();
      bloom.dispose();
      for (const pass of [upscale, rays, blurX, blurY, vignette]) pass.dispose();
    },
  };
}
