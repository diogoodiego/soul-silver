import { describe, expect, it, vi } from "vitest";
import {
  isAllowedNavigation,
  permissionRequestHandler,
  windowOpenHandler,
} from "../src/main/navigation-guard";

describe("isAllowedNavigation", () => {
  const devServerUrl = "http://localhost:5173/";

  it("allows the dev server origin in dev", () => {
    expect(isAllowedNavigation("http://localhost:5173/index.html", devServerUrl)).toBe(true);
  });

  it.each([
    "https://example.com",
    "http://localhost:4000/",
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///C:/Windows/win.ini",
    "not a url",
  ])("denies %s", (url) => {
    expect(isAllowedNavigation(url, devServerUrl)).toBe(false);
  });

  it("denies everything when there is no dev server", () => {
    expect(isAllowedNavigation("http://localhost:5173/", undefined)).toBe(false);
  });
});

describe("windowOpenHandler", () => {
  it("always denies", () => {
    expect(windowOpenHandler()).toEqual({ action: "deny" });
  });
});

describe("permissionRequestHandler", () => {
  it("denies every permission", () => {
    const callback = vi.fn();
    permissionRequestHandler(null, "media", callback);
    expect(callback).toHaveBeenCalledWith(false);
  });
});
