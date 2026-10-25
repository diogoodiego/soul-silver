import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkAssets, createConsoleLogger, createRegistry, defaultStages } from "@soulsilver/extractor";
import { loadWorld, startPosition } from "@soulsilver/server";
import { IpcChannel, PROTOCOL_VERSION } from "@soulsilver/shared";
import { CANCELLED, SAVE_SLOTS } from "@soulsilver/shared/save";
import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell, utilityProcess, type IpcMainInvokeEvent } from "electron";
import electronUpdater from "electron-updater";
import { createAssetsController } from "./assets-controller";
import { ASSETS_SCHEME, resolveAssetPath } from "./assets-protocol";
import { isAllowedNavigation, permissionRequestHandler, windowOpenHandler } from "./navigation-guard";
import { createDiscovery } from "./discovery";
import { createRemoteClient } from "./remote-connection";
import { createSaveStore } from "./save-store";
import { createServerHost } from "./server-host";
import { createSessionController, type SessionController } from "./session-controller";
import { createSettings } from "./settings";
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

protocol.registerSchemesAsPrivileged([{ scheme: ASSETS_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

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

    // The session logic needs the server host, which reports back to it.
    const sessionRef: { current: SessionController | undefined } = { current: undefined };
    const serverHost = createServerHost({
      fork: () =>
        utilityProcess.fork(join(import.meta.dirname, "server-host.js"), [...(app.isPackaged ? [] : ["--dev-arena"]), join(app.getPath("userData"), "extraction", "stages")], {
          serviceName: "SoulSilver Game Server",
        }),
      appVersion: app.getVersion(),
      onStatus: (status) => {
        send(IpcChannel.ServerStatus, status);
      },
      onGameMessage: (msg) => {
        sessionRef.current?.onServerMessage(msg);
      },
      onGameClosed: () => {
        sessionRef.current?.onServerClosed();
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
    // The page is file:// (origin "null") in production, so responses carry a CORS header.
    const cors = { "Access-Control-Allow-Origin": "*" };
    protocol.handle(ASSETS_SCHEME, async (request) => {
      const path = resolveAssetPath(assetsPaths.workspace, request.url);
      if (!path || request.method !== "GET") return new Response(null, { status: 404, headers: cors });
      try {
        const file = await net.fetch(pathToFileURL(path).toString());
        return new Response(file.body, { status: file.status, headers: { ...cors, "Content-Type": file.headers.get("Content-Type") ?? "application/octet-stream" } });
      } catch {
        return new Response(null, { status: 404, headers: cors });
      }
    });
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

    const stagesDir = join(userData, "extraction", "stages");
    const saves = createSaveStore({
      dir: join(userData, "saves"),
      start: () => startPosition(loadWorld(stagesDir, (message) => console.warn(`[saves] ${message}`))),
    });
    const settings = createSettings(join(userData, "settings.json"));
    const lanLog = (message: string) => {
      console.warn(`[lan] ${message}`);
    };
    const remote = createRemoteClient({
      onMessage: (msg) => sessionRef.current?.onRemoteMessage(msg),
      onClose: () => sessionRef.current?.onRemoteClosed(),
      log: lanLog,
    });
    const play = createSessionController({
      saves,
      server: serverHost,
      remote,
      discovery: createDiscovery({ localProtocolVersion: PROTOCOL_VERSION, appVersion: app.getVersion(), log: lanLog }),
      protocolVersion: PROTOCOL_VERSION,
      newSessionId: randomUUID,
      emit: {
        gameMessage: (msg) => {
          send(IpcChannel.GameMessage, msg);
        },
        gameClosed: () => {
          send(IpcChannel.GameClosed, undefined);
        },
        saved: (result) => {
          send(IpcChannel.GameSaved, result);
        },
        sessions: (list) => {
          send(IpcChannel.SessionsList, list);
        },
      },
      log: lanLog,
    });
    sessionRef.current = play;
    const isSlot = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= SAVE_SLOTS;
    const fields = (arg: unknown): Record<string, unknown> => (typeof arg === "object" && arg !== null ? (arg as Record<string, unknown>) : {});
    const invalid = { ok: false, reason: "Pedido inválido." } as const;

    handle(IpcChannel.ServerGetInfo, () => serverHost.getInfo());
    handle(IpcChannel.SavesList, () => saves.list());
    handle(IpcChannel.SavesCreate, (arg) => {
      const { slot, name, character, overwrite } = fields(arg);
      if (!isSlot(slot) || typeof name !== "string" || (character !== "male" && character !== "female")) return invalid;
      return saves.create(slot, name, character, overwrite === true);
    });
    handle(IpcChannel.SavesRestore, (slot) => (isSlot(slot) ? saves.restoreBackup(slot) : invalid));
    handle(IpcChannel.SavesExport, async (slot) => {
      if (!isSlot(slot)) return invalid;
      const result = await dialog.showSaveDialog(window, { defaultPath: `slot-${slot}.sssave`, filters: [{ name: "Save do SoulSilver", extensions: ["sssave"] }] });
      return result.canceled ? { ok: false, reason: CANCELLED } : saves.exportTo(slot, result.filePath);
    });
    handle(IpcChannel.SavesImport, async (arg) => {
      const { slot, overwrite } = fields(arg);
      if (!isSlot(slot)) return invalid;
      const result = await dialog.showOpenDialog(window, { properties: ["openFile"], filters: [{ name: "Save do SoulSilver", extensions: ["sssave", "json"] }] });
      const path = result.filePaths[0];
      return result.canceled || !path ? { ok: false, reason: CANCELLED } : saves.importFrom(slot, path, overwrite === true);
    });
    handle(IpcChannel.SessionSolo, (slot) => (isSlot(slot) ? play.startSolo(slot) : invalid));
    handle(IpcChannel.SessionHost, (slot) => (isSlot(slot) ? play.startHost(slot) : invalid));
    handle(IpcChannel.SessionJoin, (arg) => {
      const { slot, address } = fields(arg);
      return isSlot(slot) && typeof address === "string" ? play.joinSession(slot, address) : invalid;
    });
    handle(IpcChannel.SessionsWatch, (on) => {
      play.watchSessions(on === true);
    });
    handle(IpcChannel.SettingsGet, () => settings.get());
    handle(IpcChannel.SettingsFirewallSeen, () => settings.markFirewallNoticeSeen());
    // Fire-and-forget: inputs go out every tick, so no invoke round trip.
    ipcMain.on(IpcChannel.GameSend, (event, msg: unknown) => {
      if (event.sender === window.webContents) play.sendGame(msg);
    });
    handle(IpcChannel.AppGetVersion, () => app.getVersion());
    handle(IpcChannel.UpdateGetState, () => updates.getState());
    handle(IpcChannel.UpdateRestart, () => {
      updates.restart();
    });

    serverHost.start();
    // Leaving a session sends the final saves; give them a moment before the server goes.
    let quitting = false;
    app.on("before-quit", (event) => {
      if (quitting) return;
      quitting = true;
      event.preventDefault();
      void play.shutdown().finally(() => {
        serverHost.stop();
        void assets.shutdown();
        app.quit();
      });
    });

    // Never block startup on the network.
    updates.start();
    void assets.start();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
