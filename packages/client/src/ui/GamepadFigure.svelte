<script lang="ts" module>
  import { HL } from "../hairline/kernel.js";

  type Point = [number, number];
  interface Figure {
    name: string;
    means: string;
    range: [number, number, number];
    mount(
      host: { stage: HTMLElement; svg: SVGElement; read: { textContent: string } },
      value: number,
    ): { set(value: number): void; pick(id: string | null): void; anchors(): Record<string, Point>; destroy(): void };
  }
  // A figure declares itself by calling the global hairline() once, when its module first runs.
  const g = globalThis as unknown as { HL: typeof HL; hairline: (figure: Figure) => void };
  g.HL = HL;
  const figure = new Promise<Figure>((resolve) => {
    g.hairline = resolve;
  });
  void import("../hairline/gamepad.js");
</script>

<script lang="ts">
  // The controller tab: a Hairline figure of the pad, wordless as Hairline wants, with a label for each
  // control in the columns beside it, joined by a leader line. Each label is a menu item: the pad or keys
  // move the focus between them and the focused one lights its control; the pointer works too.
  import Button from "./Button.svelte";
  import { onMount, tick } from "svelte";
  import { spread } from "./callouts";

  /** `labels`: control id -> "A · Confirmar / Golpe 1"; a control with no action ("… · —") gets no label. */
  let { labels, idle }: { labels: Record<string, string>; idle: string } = $props();

  /** The stage is the figure's viewBox at 1:1, so anchors are pixels from its corner. */
  const SW = 400;
  const SH = 320;
  const LINE = 16;
  const GUTTER = 14;

  let root: HTMLDivElement;
  let stage: HTMLDivElement;
  let handle: ReturnType<Figure["mount"]> | undefined;
  let caption = $state("rest");
  let anchors = $state<Record<string, Point>>({});
  let bw = $state(0);
  let bh = $state(0);

  const left = $derived(Math.max(0, (bw - SW) / 2));
  const top = $derived(Math.max(0, (bh - SH) / 2));
  const column = $derived(Math.max(80, left - GUTTER));
  const active = $derived(Object.keys(labels).find((id) => labels[id] === caption));

  /** One label per control with an action, in the column on its side, spread so none overlaps. */
  const callouts = $derived.by(() => {
    const perLine = Math.max(8, Math.floor(column / 7));
    const sides = [true, false].map((onLeft) => {
      const items = Object.entries(anchors)
        .filter(([id, [x]]) => x < SW / 2 === onLeft && labels[id] && !labels[id].endsWith("—"))
        .map(([id, [x, y]]) => {
          const [name, actions = ""] = labels[id]!.split(" · ");
          const h = Math.ceil((name!.length + actions.length + 1) / perLine) * LINE;
          return { id, name: name!, actions, onLeft, ax: left + x, ay: top + y, h, y: top + y - h / 2 };
        });
      const ys = spread(items, 0, bh);
      return items.map((item, i) => ({ ...item, y: ys[i]! }));
    });
    return sides.flat();
  });

  onMount(() => {
    let gone = false;
    void figure.then(async (f) => {
      if (gone) return;
      HL.inject(document);
      stage.dataset["hairline"] = f.name;
      stage.dataset["labels"] = JSON.stringify(labels);
      const svg = HL.mk("svg", { viewBox: `0 0 ${SW} ${SH}`, "aria-hidden": "true" }, stage);
      const read = {
        get textContent() {
          return caption;
        },
        set textContent(value: string) {
          caption = value;
        },
      };
      handle = f.mount({ stage, svg, read }, f.range[1]);
      anchors = handle.anchors();
      // The labels arrive after the tab focused its first item, so the menu starts on A, lit at rest.
      await tick();
      if (!gone && !root.contains(document.activeElement)) root.querySelector<HTMLElement>('[data-control="a"]')?.focus();
    });
    return () => {
      gone = true;
      handle?.destroy();
    };
  });
</script>

<div bind:this={root} class="relative h-full min-h-[330px] w-full" bind:clientWidth={bw} bind:clientHeight={bh}>
  <svg class="pointer-events-none absolute inset-0" width={bw} height={bh} aria-hidden="true">
    {#each callouts as c (c.id)}
      {@const x = c.onLeft ? column + 4 : bw - column - 4}
      <polyline
        points="{x},{c.y + LINE / 2} {c.onLeft ? x + 10 : x - 10},{c.y + LINE / 2} {c.ax},{c.ay}"
        fill="none"
        stroke={c.id === active ? "#e8e8e8" : "#4a4a4a"}
        stroke-width="1"
      />
      <circle cx={c.ax} cy={c.ay} r="1.8" fill={c.id === active ? "#e8e8e8" : "#4a4a4a"} />
    {/each}
  </svg>
  <!-- The plate colour is the screen's, so the figure's opaque plates read as the screen itself. -->
  <div bind:this={stage} class="absolute" style:left="{left}px" style:top="{top}px" style:width="{SW}px" style:height="{SH}px" data-hairline-theme="dark" style="--hairline-plate: #131313" role="img" aria-label={idle}></div>
  {#each callouts as c (c.id)}
    <Button
      data-control={c.id}
      data-side={c.onLeft ? "left" : "right"}
      variant="bare"
      class="absolute p-0 text-xs leading-4 outline-none focus:bg-action-primary-bg focus:text-action-primary-text focus:[font-palette:--action-primary-text] {c.onLeft ? 'text-right' : 'text-left'} {c.id === active ? 'text-primary' : 'text-tertiary'}"
      style="left: {c.onLeft ? 0 : bw - column}px; top: {c.y}px; width: {column}px"
      onfocus={() => handle?.pick(c.id)}
    >
      <b class="text-inherit">{c.name}</b> {c.actions}
    </Button>
  {/each}
  <p class="sr-only" aria-live="polite">{caption === "rest" ? idle : caption}</p>
</div>
