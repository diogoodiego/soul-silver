import {
  IpcChannel,
  type ServerInfo,
  type ServerStatus,
  type SoulSilverApi,
  type UpdateState,
} from "@soulsilver/shared";
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

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
};

contextBridge.exposeInMainWorld("soulSilver", api);
