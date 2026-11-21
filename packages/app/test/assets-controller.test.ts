import { EventEmitter } from "node:events";
import type { AssetsState, MainToExtractorMessage } from "@soulsilver/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AssetsCheckResult, createAssetsController, type ExtractorProcess } from "../src/main/assets-controller";

class FakeHost extends EventEmitter implements ExtractorProcess {
  sent: MainToExtractorMessage[] = [];
  killed = false;
  postMessage(msg: MainToExtractorMessage): void {
    this.sent.push(msg);
  }
  kill(): boolean {
    this.killed = true;
    this.exit(1);
    return true;
  }
  reply(msg: unknown): void {
    this.emit("message", msg);
  }
  exit(code = 0): void {
    this.emit("exit", code);
  }
  /** Sends a final message and exits, like the real host. */
  finish(msg: unknown): void {
    this.reply(msg);
    this.exit(0);
  }
}

const paths = { romCopy: "C:\\data\\rom\\soulsilver.nds", workspace: "C:\\data\\extraction", logFile: "C:\\data\\logs\\extractor.log" };

function setup(check: AssetsCheckResult, dialogPath: string | null = "C:\\roms\\ss.nds", removeWorkspace = vi.fn((_dir: string) => Promise.resolve())) {
  const hosts: FakeHost[] = [];
  const states: AssetsState[] = [];
  const showItemInFolder = vi.fn();
  const controller = createAssetsController({
    paths,
    appVersion: "0.1.0",
    checkAssets: vi.fn(() => Promise.resolve(check)),
    fork: () => {
      const host = new FakeHost();
      hosts.push(host);
      return host;
    },
    showOpenDialog: vi.fn(() => Promise.resolve(dialogPath ?? undefined)),
    showItemInFolder,
    removeWorkspace,
    onState: (s) => states.push(s),
    log: () => {},
  });
  const host = () => hosts.at(-1)!;
  return { controller, hosts, host, states, showItemInFolder };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("assets controller: first run", () => {
  it("goes from checking to needs-rom", async () => {
    const { controller, states } = setup({ status: "needs-rom" });
    await controller.start();
    expect(states).toEqual([{ status: "checking" }, { status: "needs-rom", savedRom: false, previousRomInvalid: false }]);
  });

  it("validates, copies, extracts and becomes ready", async () => {
    const { controller, hosts, host } = setup({ status: "needs-rom" });
    await controller.start();
    await controller.chooseRom();
    expect(controller.getState()).toEqual({ status: "validating" });
    expect(host().sent).toEqual([
      { type: "validate-and-copy", sourcePath: "C:\\roms\\ss.nds", romCopyPath: paths.romCopy, logPath: paths.logFile },
    ]);

    host().reply({ type: "validated", result: { ok: true, sha1: "a".repeat(40), size: 10 } });
    expect(controller.getState()).toEqual({ status: "validating" });
    host().finish({ type: "copied" });

    expect(hosts).toHaveLength(2);
    expect(host().sent).toEqual([
      { type: "extract", romCopyPath: paths.romCopy, workspaceDir: paths.workspace, logPath: paths.logFile, appVersion: "0.1.0" },
    ]);
    expect(controller.getState()).toMatchObject({ status: "extracting", mode: "first-run", percent: 0 });

    host().reply({ type: "progress", stageTitle: "Desempacotando a ROM", percent: 40 });
    host().reply({ type: "progress", stageTitle: "Desempacotando a ROM", percent: 30 });
    expect(controller.getState()).toEqual({ status: "extracting", mode: "first-run", stageTitle: "Desempacotando a ROM", percent: 40 });

    host().finish({ type: "completed" });
    expect(controller.getState()).toEqual({ status: "ready" });
  });

  it("is ready straight away when the assets are ready, without forking", async () => {
    const { controller, hosts, states } = setup({ status: "ready" });
    await controller.start();
    expect(states).toEqual([{ status: "checking" }, { status: "ready" }]);
    expect(hosts).toHaveLength(0);
  });

  it("ignores ROM requests outside needs-rom and rejected", async () => {
    const { controller, hosts } = setup({ status: "ready" });
    await controller.start();
    await controller.chooseRom();
    await controller.submitRomPath("C:\\x.nds");
    expect(hosts).toHaveLength(0);
  });

  it("keeps the state when the dialog is cancelled", async () => {
    const { controller, hosts } = setup({ status: "needs-rom" }, null);
    await controller.start();
    await controller.chooseRom();
    expect(controller.getState()).toMatchObject({ status: "needs-rom" });
    expect(hosts).toHaveLength(0);
  });

  it("fails as unexpected when the host exits without a final message", async () => {
    const { controller, host } = setup({ status: "needs-rom" });
    await controller.start();
    await controller.submitRomPath("C:\\roms\\ss.nds");
    host().exit(1);
    expect(controller.getState()).toEqual({ status: "failed", failure: { code: "unexpected" } });
  });

  it("discards invalid host messages", async () => {
    const { controller, host } = setup({ status: "needs-rom" });
    await controller.start();
    await controller.submitRomPath("C:\\roms\\ss.nds");
    host().reply({ type: "progress", stageTitle: "", percent: 500 });
    expect(controller.getState()).toEqual({ status: "validating" });
  });
});

describe("assets controller: rejected ROM", () => {
  it("shows the rejection and never extracts", async () => {
    const { controller, hosts, host } = setup({ status: "needs-rom" });
    await controller.start();
    await controller.submitRomPath("C:\\roms\\hg.nds");
    host().finish({ type: "validated", result: { ok: false, rejection: { reason: "heartgold", region: "usa" } } });
    expect(controller.getState()).toEqual({ status: "rejected", rejection: { reason: "heartgold", region: "usa" } });
    expect(hosts).toHaveLength(1);
  });

  it.each(["chooseRom", "submitRomPath"] as const)("goes back to validating from rejected via %s", async (method) => {
    const { controller, hosts, host } = setup({ status: "needs-rom" });
    await controller.start();
    await controller.submitRomPath("C:\\roms\\hg.nds");
    host().finish({ type: "validated", result: { ok: false, rejection: { reason: "modified" } } });
    await (method === "chooseRom" ? controller.chooseRom() : controller.submitRomPath("C:\\roms\\ss.nds"));
    expect(controller.getState()).toEqual({ status: "validating" });
    expect(hosts).toHaveLength(2);
  });

  it("ignores an empty path", async () => {
    const { controller, hosts } = setup({ status: "needs-rom" });
    await controller.start();
    await controller.submitRomPath("");
    expect(controller.getState()).toMatchObject({ status: "needs-rom" });
    expect(hosts).toHaveLength(0);
  });
});

describe("assets controller: update and repair", () => {
  it.each([
    ["outdated", "update"],
    ["outputs-missing", "repair"],
    ["incomplete", "resume"],
    ["no-manifest", "resume"],
  ] as const)("re-extracts with the saved ROM when %s, without asking for it", async (reason, mode) => {
    const { controller, hosts, host } = setup({ status: "needs-extraction", romAvailable: true, reason });
    await controller.start();
    expect(hosts).toHaveLength(1);
    expect(host().sent[0]).toMatchObject({ type: "extract" });
    expect(controller.getState()).toMatchObject({ status: "extracting", mode });
  });

  it("asks for the ROM when the saved copy is not available", async () => {
    const { controller, hosts } = setup({ status: "needs-extraction", romAvailable: false, reason: "outdated" });
    await controller.start();
    expect(hosts).toHaveLength(0);
    expect(controller.getState()).toEqual({ status: "needs-rom", savedRom: false, previousRomInvalid: false });
  });

  it("asks for the ROM again when the host finds the saved copy invalid", async () => {
    const { controller, host } = setup({ status: "needs-extraction", romAvailable: true, reason: "outdated" });
    await controller.start();
    host().finish({ type: "rom-copy-invalid" });
    expect(controller.getState()).toEqual({ status: "needs-rom", savedRom: false, previousRomInvalid: true });
  });
});

describe("assets controller: cancel and close", () => {
  async function extracting() {
    const ctx = setup({ status: "needs-extraction", romAvailable: true, reason: "incomplete" });
    await ctx.controller.start();
    return ctx;
  }

  it("cancels and returns to needs-rom with the saved ROM", async () => {
    const { controller, host } = await extracting();
    controller.cancel();
    expect(controller.getState()).toEqual({ status: "cancelling" });
    expect(host().sent.at(-1)).toEqual({ type: "cancel" });
    host().finish({ type: "cancelled" });
    expect(controller.getState()).toEqual({ status: "needs-rom", savedRom: true, previousRomInvalid: false });
  });

  it("kills the host if it does not exit within 5 s", async () => {
    const { controller, host } = await extracting();
    controller.cancel();
    vi.advanceTimersByTime(4999);
    expect(host().killed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(host().killed).toBe(true);
    expect(controller.getState()).toEqual({ status: "needs-rom", savedRom: true, previousRomInvalid: false });
  });

  it("does not kill a host that exited in time", async () => {
    const { controller, host } = await extracting();
    controller.cancel();
    host().finish({ type: "cancelled" });
    vi.advanceTimersByTime(10_000);
    expect(host().killed).toBe(false);
  });

  it("resumes with the saved ROM after a cancel", async () => {
    const { controller, hosts, host } = await extracting();
    controller.cancel();
    host().finish({ type: "cancelled" });
    await controller.startExtraction();
    expect(hosts).toHaveLength(2);
    expect(controller.getState()).toMatchObject({ status: "extracting", mode: "resume" });
  });

  it("does not resume without a saved ROM", async () => {
    const { controller, hosts } = setup({ status: "needs-rom" });
    await controller.start();
    await controller.startExtraction();
    expect(hosts).toHaveLength(0);
  });

  it("is busy only while validating, extracting or cancelling", async () => {
    const { controller, host } = setup({ status: "needs-rom" });
    await controller.start();
    expect(controller.isBusy()).toBe(false);
    await controller.submitRomPath("C:\\roms\\ss.nds");
    expect(controller.isBusy()).toBe(true);
    controller.cancel();
    expect(controller.isBusy()).toBe(true);
    host().finish({ type: "cancelled" });
    expect(controller.isBusy()).toBe(false);
  });

  it("shuts down by cancelling and waiting for the host", async () => {
    const { controller, host } = await extracting();
    let done = false;
    const shutdown = controller.shutdown().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    expect(host().sent.at(-1)).toEqual({ type: "cancel" });
    vi.advanceTimersByTime(5000);
    await shutdown;
    expect(done).toBe(true);
  });

  it("shuts down immediately when idle", async () => {
    const { controller } = setup({ status: "ready" });
    await controller.start();
    await controller.shutdown();
  });
});

describe("assets controller: failures and log", () => {
  it.each([
    { code: "disk-full", requiredBytes: 100, availableBytes: 10 },
    { code: "write-permission", path: "D:/data" },
    { code: "busy" },
    { code: "stage-failed", stageTitle: "Desempacotando a ROM" },
  ] as const)("shows the failure %o", async (failure) => {
    const { controller, host } = setup({ status: "needs-extraction", romAvailable: true, reason: "outdated" });
    await controller.start();
    host().finish({ type: "failed", failure });
    expect(controller.getState()).toEqual({ status: "failed", failure });
  });

  it("retries from failed by checking again", async () => {
    const { controller, host, states } = setup({ status: "needs-extraction", romAvailable: true, reason: "outdated" });
    await controller.start();
    host().finish({ type: "failed", failure: { code: "busy" } });
    states.length = 0;
    await controller.startExtraction();
    expect(states[0]).toEqual({ status: "checking" });
    expect(controller.getState()).toMatchObject({ status: "extracting", mode: "update" });
  });

  it("opens the log in Explorer", async () => {
    const { controller, showItemInFolder } = setup({ status: "ready" });
    await controller.start();
    controller.openLog();
    expect(showItemInFolder).toHaveBeenCalledWith(paths.logFile);
  });
});

describe("assets controller: delete extraction", () => {
  it("removes the workspace when idle", async () => {
    const removeWorkspace = vi.fn((_dir: string) => Promise.resolve());
    const { controller } = setup({ status: "ready" }, null, removeWorkspace);
    await controller.start();
    expect(await controller.deleteExtraction()).toBe(true);
    expect(removeWorkspace).toHaveBeenCalledWith(paths.workspace);
  });

  it("refuses while extracting", async () => {
    const removeWorkspace = vi.fn((_dir: string) => Promise.resolve());
    const { controller } = setup({ status: "needs-extraction", romAvailable: true, reason: "no-manifest" }, null, removeWorkspace);
    await controller.start();
    expect(controller.getState().status).toBe("extracting");
    expect(await controller.deleteExtraction()).toBe(false);
    expect(removeWorkspace).not.toHaveBeenCalled();
  });
});
