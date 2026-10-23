import {
  type AssetsState,
  IpcChannel,
  type ServerInfo,
  type ServerStatus,
  type SoulSilverApi,
  type UpdateState,
} from "@soulsilver/shared";
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
};

contextBridge.exposeInMainWorld("soulSilver", api);
