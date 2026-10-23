import { IpcChannel, type ServerInfo, type ServerStatus, type SoulSilverApi } from "@soulsilver/shared";
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

const api: SoulSilverApi = {
  getServerInfo: () => ipcRenderer.invoke(IpcChannel.ServerGetInfo) as Promise<ServerInfo>,
  onServerStatus: (listener) => {
    const handler = (_event: IpcRendererEvent, status: ServerStatus) => {
      listener(status);
    };
    ipcRenderer.on(IpcChannel.ServerStatus, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannel.ServerStatus, handler);
    };
  },
};

contextBridge.exposeInMainWorld("soulSilver", api);
