import {
  type AppSettings,
  type AssetsState,
  IpcChannel,
  type ServerInfo,
  type ServerStatus,
  type SessionResult,
  type SoulSilverApi,
  type UpdateState,
} from "@soulsilver/shared";
import type { SessionListing } from "@soulsilver/shared/lan";
import type { SaveResult, SlotSummary } from "@soulsilver/shared/save";
import { contextBridge, ipcRenderer, type IpcRendererEvent, webUtils } from "electron";

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => {
    listener(payload);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: SoulSilverApi = {
  getServerInfo: () => ipcRenderer.invoke(IpcChannel.ServerGetInfo) as Promise<ServerInfo>,
  onServerStatus: (listener) => subscribe<ServerStatus>(IpcChannel.ServerStatus, listener),
  getAppVersion: () => ipcRenderer.invoke(IpcChannel.AppGetVersion) as Promise<string>,
  getUpdateState: () => ipcRenderer.invoke(IpcChannel.UpdateGetState) as Promise<UpdateState>,
  onUpdateState: (listener) => subscribe<UpdateState>(IpcChannel.UpdateState, listener),
  restartToUpdate: () => ipcRenderer.invoke(IpcChannel.UpdateRestart) as Promise<void>,
  getAssetsState: () => ipcRenderer.invoke(IpcChannel.AssetsGetState) as Promise<AssetsState>,
  onAssetsState: (listener) => subscribe<AssetsState>(IpcChannel.AssetsState, listener),
  chooseRom: () => ipcRenderer.invoke(IpcChannel.AssetsChooseRom) as Promise<void>,
  // Sandboxed renderers have no File.path; only the path crosses to the main process.
  submitRomFile: (file) => ipcRenderer.invoke(IpcChannel.AssetsSubmitRomPath, webUtils.getPathForFile(file)) as Promise<void>,
  startExtraction: () => ipcRenderer.invoke(IpcChannel.AssetsStart) as Promise<void>,
  cancelExtraction: () => ipcRenderer.invoke(IpcChannel.AssetsCancel) as Promise<void>,
  openExtractionLog: () => ipcRenderer.invoke(IpcChannel.AssetsOpenLog) as Promise<void>,
  sendGame: (msg) => {
    ipcRenderer.send(IpcChannel.GameSend, msg);
  },
  onGameMessage: (listener) => subscribe<unknown>(IpcChannel.GameMessage, listener),
  onGameClosed: (listener) => subscribe<undefined>(IpcChannel.GameClosed, () => {
    listener();
  }),
  onGameSaved: (listener) => subscribe<SaveResult>(IpcChannel.GameSaved, listener),
  listSaves: () => ipcRenderer.invoke(IpcChannel.SavesList) as Promise<SlotSummary[]>,
  createSave: (slot, name, character, overwrite) => ipcRenderer.invoke(IpcChannel.SavesCreate, { slot, name, character, overwrite }) as Promise<SaveResult>,
  restoreBackup: (slot) => ipcRenderer.invoke(IpcChannel.SavesRestore, slot) as Promise<SaveResult>,
  exportSave: (slot) => ipcRenderer.invoke(IpcChannel.SavesExport, slot) as Promise<SaveResult>,
  importSave: (slot, overwrite) => ipcRenderer.invoke(IpcChannel.SavesImport, { slot, overwrite }) as Promise<SaveResult>,
  startSolo: (slot) => ipcRenderer.invoke(IpcChannel.SessionSolo, slot) as Promise<SessionResult>,
  startHost: (slot) => ipcRenderer.invoke(IpcChannel.SessionHost, slot) as Promise<SessionResult>,
  joinSession: (slot, address) => ipcRenderer.invoke(IpcChannel.SessionJoin, { slot, address }) as Promise<SessionResult>,
  watchSessions: (listener) => {
    const unsubscribe = subscribe<SessionListing[]>(IpcChannel.SessionsList, listener);
    void ipcRenderer.invoke(IpcChannel.SessionsWatch, true);
    return () => {
      unsubscribe();
      void ipcRenderer.invoke(IpcChannel.SessionsWatch, false);
    };
  },
  getSettings: () => ipcRenderer.invoke(IpcChannel.SettingsGet) as Promise<AppSettings>,
  markFirewallNoticeSeen: () => ipcRenderer.invoke(IpcChannel.SettingsFirewallSeen) as Promise<void>,
};

contextBridge.exposeInMainWorld("soulSilver", api);
