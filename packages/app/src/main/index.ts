import { join } from "node:path";
import { checkAssets, createConsoleLogger, createRegistry, defaultStages } from "@soulsilver/extractor";
import { IpcChannel } from "@soulsilver/shared";
import { app, BrowserWindow, dialog, ipcMain, session, shell, utilityProcess, type IpcMainInvokeEvent } from "electron";
import electronUpdater from "electron-updater";
import { createAssetsController } from "./assets-controller";
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
    const handle = <T>(channel: string, handler: (arg: unknown) => T) => {
      ipcMain.handle(channel, (event: IpcMainInvokeEvent, arg: unknown) => {
        if (event.sender !== window.webContents) throw new Error("Unexpected sender");
        return handler(arg);
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
      onGameMessage: (msg) => {
        send(IpcChannel.GameMessage, msg);
      },
      onGameClosed: () => {
        send(IpcChannel.GameClosed, undefined);
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

    const userData = app.getPath("userData");
    const assetsPaths = {
      romCopy: join(userData, "rom", "soulsilver.nds"),
      workspace: join(userData, "extraction"),
      logFile: join(userData, "logs", "extractor.log"),
    };
    const registry = createRegistry(defaultStages);
    const assets = createAssetsController({
      paths: assetsPaths,
      appVersion: app.getVersion(),
      checkAssets: () =>
        checkAssets({
          workspaceDir: assetsPaths.workspace,
          romPath: assetsPaths.romCopy,
          registry,
          log: createConsoleLogger(),
        }),
      fork: () =>
        utilityProcess.fork(join(import.meta.dirname, "extractor-host.js"), [], {
          serviceName: "SoulSilver Extractor",
        }),
      showOpenDialog: async () => {
        const result = await dialog.showOpenDialog(window, {
          properties: ["openFile"],
          filters: [
            { name: "ROM de Nintendo DS", extensions: ["nds"] },
            { name: "Todos os arquivos", extensions: ["*"] },
          ],
        });
        return result.canceled ? undefined : result.filePaths[0];
      },
      showItemInFolder: (path) => {
        shell.showItemInFolder(path);
      },
      onState: (state) => {
        send(IpcChannel.AssetsState, state);
      },
      log: (message) => {
        console.warn(`[assets] ${message}`);
      },
    });

    // Closing mid-extraction is safe (the next launch resumes), but ask first (FR-023).
    window.on("close", (event) => {
      if (!assets.isBusy()) return;
      event.preventDefault();
      void dialog
        .showMessageBox(window, {
          type: "question",
          buttons: ["Fechar mesmo assim", "Continuar"],
          defaultId: 1,
          cancelId: 1,
          message: "A extração está em andamento.",
          detail: "Se fechar agora, ela será retomada na próxima vez que você abrir o jogo.",
        })
        .then(async ({ response }) => {
          if (response !== 0) return;
          await assets.shutdown();
          window.destroy();
        });
    });

    handle(IpcChannel.AssetsGetState, () => assets.getState());
    handle(IpcChannel.AssetsChooseRom, () => assets.chooseRom());
    handle(IpcChannel.AssetsSubmitRomPath, (path) => (typeof path === "string" && path.length > 0 ? assets.submitRomPath(path) : undefined));
    handle(IpcChannel.AssetsStart, () => assets.startExtraction());
    handle(IpcChannel.AssetsCancel, () => {
      assets.cancel();
    });
    handle(IpcChannel.AssetsOpenLog, () => {
      assets.openLog();
    });

    handle(IpcChannel.ServerGetInfo, () => serverHost.getInfo());
    handle(IpcChannel.GameConnect, () => {
      serverHost.connectGame();
    });
    // Fire-and-forget: inputs go out every tick, so no invoke round trip.
    ipcMain.on(IpcChannel.GameSend, (event, msg: unknown) => {
      if (event.sender === window.webContents) serverHost.sendGame(msg);
    });
    handle(IpcChannel.AppGetVersion, () => app.getVersion());
    handle(IpcChannel.UpdateGetState, () => updates.getState());
    handle(IpcChannel.UpdateRestart, () => {
      updates.restart();
    });

    serverHost.start();
    app.on("before-quit", () => {
      serverHost.stop();
      void assets.shutdown();
    });

    // Never block startup on the network.
    updates.start();
    void assets.start();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
