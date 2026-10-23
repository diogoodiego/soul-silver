/**
 * The renderer never navigates: it loads once and stays there. The only allowed
 * navigation is a reload from the Vite dev server during development.
 */
export function isAllowedNavigation(url: string, devServerUrl: string | undefined): boolean {
  if (!devServerUrl) return false;
  try {
    return new URL(url).origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
}

export function windowOpenHandler(): { action: "deny" } {
  return { action: "deny" };
}

export function permissionRequestHandler(
  _webContents: unknown,
  _permission: string,
  callback: (granted: boolean) => void,
): void {
  callback(false);
}
