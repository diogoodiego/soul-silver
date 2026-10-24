import { z } from "zod";
import { playerInput } from "./protocol.ts";

// A recorded session: everything needed to replay it to the same final state (spec 010, research R9).

const count = () => z.number().int().nonnegative();

export const recordingEvent = z.discriminatedUnion("kind", [
  z.strictObject({ tick: count(), kind: z.literal("join"), playerId: count(), name: z.string() }),
  z.strictObject({ tick: count(), kind: z.literal("leave"), playerId: count() }),
  z.strictObject({ tick: count(), kind: z.literal("input"), playerId: count(), input: playerInput }),
]);
export type RecordingEvent = z.infer<typeof recordingEvent>;

export const recording = z.strictObject({
  protocolVersion: count(),
  seed: count(),
  /** Tick the session had reached when the recording ended. */
  ticks: count(),
  events: z.array(recordingEvent),
});
export type Recording = z.infer<typeof recording>;
