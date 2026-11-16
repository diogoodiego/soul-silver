import type { AppSettings } from "@soulsilver/shared";
import { NearestFilter, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// HD-2D post-processing (item V.1): the scene is drawn at the native view size, upscaled with nearest
// filtering to the canvas, which is the size of the screen, and the effects run there, so the pixels
// stay crisp under a smooth blur and glow. Shaders skip the colorspace include: the ROM colors go out as they are.

type Visual = AppSettings["visual"];

const VERTEX = "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";

/** The native frame, nearest-sampled, with a haze thickening toward the top of the screen (the far side of the map). */
const UPSCALE_FOG = {
  uniforms: { tScene: { value: null }, fog: { value: 0 } },
  vertexShader: VERTEX,
  fragmentShader: `
    uniform sampler2D tScene; uniform float fog; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tScene, vUv).rgb;
      gl_FragColor = vec4(mix(c, vec3(0.86, 0.9, 0.96), fog * smoothstep(0.5, 1.0, vUv.y)), 1.0);
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
const MAX = { fog: 0.6, bloom: 0.8, blurPx: 6, vignette: 0.7 };
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
  blurX.uniforms["dir"]!.value.set(1, 0);
  blurY.uniforms["dir"]!.value.set(0, 1);
  const vignette = new ShaderPass(VIGNETTE);
  for (const pass of [upscale, bloom, blurX, blurY, vignette]) composer.addPass(pass);
  let scale = 1;

  return {
    /** Native view size and the whole-number scale to the canvas. */
    setSize(w: number, h: number, s: number): void {
      scale = s;
      native.setSize(w, h);
      composer.setSize(w * s, h * s);
      // Low quality: the glow is computed at half the resolution again.
      if (quality === "low") bloom.setSize((w * s) / 2, (h * s) / 2);
      for (const blur of [blurX, blurY]) blur.uniforms["texel"]!.value.set(1 / (w * s), 1 / (h * s));
    },
    /** `focusY`: the player's height on the screen, 0 at the top and 1 at the bottom. */
    render(scene: Scene, camera: Camera, visual: Visual, focusY: number, outdoor: boolean): void {
      renderer.setRenderTarget(native);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      upscale.uniforms["fog"]!.value = outdoor ? (visual.fog / 100) * MAX.fog : 0;
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
      for (const pass of [upscale, blurX, blurY, vignette]) pass.dispose();
    },
  };
}
