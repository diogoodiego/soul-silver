import { IpcChannel } from "@soulsilver/shared";
import { expect, it } from "vitest";

it("resolves the shared contract from the client package", () => {
  expect(IpcChannel.ServerStatus).toBe("server:status");
});
