import { join } from "node:path";
import { IpcChannel } from "@soulsilver/shared";
import { app, BrowserWindow, ipcMain, session, utilityProcess } from "electron";
import { isAllowedNavigation, permissionRequestHandler, windowOpenHandler } from "./navigation-guard";
import { createServerHost } from "./server-host";
import { createWindowOptions } from "./window-options";

const devServerUrl = process.env["ELECTRON_RENDERER_URL"];

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow(createWindowOptions(join(import.meta.dirname, "../preload/index.cjs")));
  window.webContents.on("will-navigate", (event) => {
    if (!isAllowedNavigation(event.url, devServerUrl)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(windowOpenHandler);
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
  return window;
}

void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(permissionRequestHandler);

  const window = createMainWindow();
  const serverHost = createServerHost({
    fork: () =>
      utilityProcess.fork(join(import.meta.dirname, "server-host.js"), [], {
        serviceName: "SoulSilver Game Server",
      }),
    appVersion: app.getVersion(),
    onStatus: (status) => {
      if (!window.isDestroyed()) window.webContents.send(IpcChannel.ServerStatus, status);
    },
    log: (message) => {
      console.warn(`[server-host] ${message}`);
    },
  });

  ipcMain.handle(IpcChannel.ServerGetInfo, (event) => {
    if (event.sender !== window.webContents) throw new Error("Unexpected sender");
    return serverHost.getInfo();
  });

  serverHost.start();
  app.on("before-quit", () => {
    serverHost.stop();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
