import type { BrowserWindowConstructorOptions } from "electron";

export function createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    title: "SoulSilver Desktop",
    width: 960,
    height: 640,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  };
}
