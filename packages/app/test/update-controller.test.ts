import { EventEmitter } from "node:events";
import type { UpdateState } from "@soulsilver/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUpdateController } from "../src/main/update-controller";

class FakeUpdater extends EventEmitter {
  checkForUpdates = vi.fn(() => new Promise<unknown>(() => {}));
  quitAndInstall = vi.fn();
}

function setup({ isPackaged = true } = {}) {
  const updater = new FakeUpdater();
  const states: UpdateState[] = [];
  const controller = createUpdateController({
    updater,
    isPackaged,
    currentVersion: "0.2.0",
    onState: (s) => states.push(s),
  });
  return { updater, states, controller };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createUpdateController", () => {
  it("stays disabled and never checks when not packaged", () => {
    const { updater, controller, states } = setup({ isPackaged: false });
    controller.start();
    expect(controller.getState()).toEqual({ status: "disabled" });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(states).toEqual([]);
  });

  it("checks on start", () => {
    const { updater, controller, states } = setup();
    controller.start();
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    expect(states).toEqual([{ status: "checking" }]);
  });

  it("reports up-to-date", () => {
    const { updater, controller } = setup();
    controller.start();
    updater.emit("update-not-available", { version: "0.2.0" });
    expect(controller.getState()).toEqual({ status: "up-to-date" });
  });

  it("downloads an available update and reports progress that never decreases", () => {
    const { updater, controller, states } = setup();
    controller.start();
    updater.emit("update-available", { version: "0.3.0" });
    expect(controller.getState()).toEqual({ status: "downloading", version: "0.3.0", percent: 0 });
    updater.emit("download-progress", { percent: 41.6 });
    updater.emit("download-progress", { percent: 30 });
    expect(controller.getState()).toEqual({ status: "downloading", version: "0.3.0", percent: 42 });
    expect(states.filter((s) => s.status === "downloading")).toHaveLength(2);
  });

  it("is ready after the download with both versions", () => {
    const { updater, controller } = setup();
    controller.start();
    updater.emit("update-available", { version: "0.3.0" });
    updater.emit("update-downloaded", { version: "0.3.0" });
    expect(controller.getState()).toEqual({ status: "ready", currentVersion: "0.2.0", newVersion: "0.3.0" });
  });

  describe("offline and failures", () => {
    it("fails the check on an updater error", () => {
      const { updater, controller } = setup();
      controller.start();
      updater.emit("error", new Error("net::ERR_INTERNET_DISCONNECTED"));
      expect(controller.getState()).toEqual({ status: "check-failed" });
    });

    it("fails the check when checkForUpdates rejects, without an unhandled rejection", async () => {
      const { updater, controller } = setup();
      updater.checkForUpdates.mockReturnValueOnce(Promise.reject(new Error("offline")));
      controller.start();
      await vi.runAllTimersAsync();
      expect(controller.getState()).toEqual({ status: "check-failed" });
    });

    it("fails the check after 15 s without an answer", () => {
      const { controller } = setup();
      controller.start();
      vi.advanceTimersByTime(14_999);
      expect(controller.getState()).toEqual({ status: "checking" });
      vi.advanceTimersByTime(1);
      expect(controller.getState()).toEqual({ status: "check-failed" });
    });

    it("ignores events that arrive after the check failed", () => {
      const { updater, controller } = setup();
      controller.start();
      vi.advanceTimersByTime(15_000);
      updater.emit("update-available", { version: "0.3.0" });
      updater.emit("update-not-available", { version: "0.2.0" });
      expect(controller.getState()).toEqual({ status: "check-failed" });
    });

    it("fails on an error during the download", () => {
      const { updater, controller } = setup();
      controller.start();
      updater.emit("update-available", { version: "0.3.0" });
      updater.emit("error", new Error("connection reset"));
      expect(controller.getState()).toEqual({ status: "check-failed" });
    });

    it("does not time out once the check has answered", () => {
      const { updater, controller } = setup();
      controller.start();
      updater.emit("update-available", { version: "0.3.0" });
      vi.advanceTimersByTime(60_000);
      expect(controller.getState()).toMatchObject({ status: "downloading" });
    });
  });

  it("restarts only when ready", () => {
    const { updater, controller } = setup();
    controller.start();
    controller.restart();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    updater.emit("update-available", { version: "0.3.0" });
    updater.emit("update-downloaded", { version: "0.3.0" });
    controller.restart();
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });
});
