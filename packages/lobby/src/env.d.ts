import type { Directory } from "./directory.ts";
import type { Room } from "./room.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      ROOM: DurableObjectNamespace<Room>;
      DIRECTORY: DurableObjectNamespace<Directory>;
      /** O.3: the TURN key, as Worker secrets; absent, rooms get STUN only. */
      TURN_KEY_ID?: string;
      TURN_KEY_API_TOKEN?: string;
    }
    interface GlobalProps {
      mainModule: typeof import("./index.ts");
      durableNamespaces: "Room" | "Directory";
    }
  }
}
