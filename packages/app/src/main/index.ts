import { join } from "node:path";
import { IpcChannel } from "@soulsilver/shared";
import { app, BrowserWindow, ipcMain, session, utilityProcess, type IpcMainInvokeEvent } from "electron";
import electronUpdater from "electron-updater";
import { isAllowedNavigation, permissionRequestHandler, windowOpenHandler } from "./navigation-guard";
import { createServerHost } from "./server-host";
import { createUpdateController } from "./update-controller";
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

// Only one instance may run, so only one instance downloads and applies updates.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler(permissionRequestHandler);

    const window = createMainWindow();
    const send = (channel: string, payload: unknown) => {
      if (!window.isDestroyed()) window.webContents.send(channel, payload);
    };
    const handle = <T>(channel: string, handler: () => T) => {
      ipcMain.handle(channel, (event: IpcMainInvokeEvent) => {
        if (event.sender !== window.webContents) throw new Error("Unexpected sender");
        return handler();
      });
    };

    app.on("second-instance", () => {
      if (window.isMinimized()) window.restore();
      window.focus();
    });

    const serverHost = createServerHost({
      fork: () =>
        utilityProcess.fork(join(import.meta.dirname, "server-host.js"), [], {
          serviceName: "SoulSilver Game Server",
        }),
      appVersion: app.getVersion(),
      onStatus: (status) => {
        send(IpcChannel.ServerStatus, status);
      },
      log: (message) => {
        console.warn(`[server-host] ${message}`);
      },
    });

    const { autoUpdater } = electronUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.logger = null;
    const updates = createUpdateController({
      updater: autoUpdater,
      isPackaged: app.isPackaged,
      currentVersion: app.getVersion(),
      onState: (state) => {
        send(IpcChannel.UpdateState, state);
      },
    });

    handle(IpcChannel.ServerGetInfo, () => serverHost.getInfo());
    handle(IpcChannel.AppGetVersion, () => app.getVersion());
    handle(IpcChannel.UpdateGetState, () => updates.getState());
    handle(IpcChannel.UpdateRestart, () => {
      updates.restart();
    });

    serverHost.start();
    app.on("before-quit", () => {
      serverHost.stop();
    });

    // Never block startup on the network.
    updates.start();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
