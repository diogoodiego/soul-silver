import { PROTOCOL_VERSION } from "@soulsilver/shared";
import type { Recording, RecordingEvent } from "@soulsilver/shared/game";
import { createSession, type Session, type SessionOptions } from "./session";

// Session recording and replay (spec 010, US4, research R9).

export function createRecorder(seed: number) {
  const events: RecordingEvent[] = [];
  return {
    /** Pass as SessionOptions.onRecord, with the same seed. */
    onRecord: (event: RecordingEvent) => {
      events.push(event);
    },
    recording: (ticks: number): Recording => ({ protocolVersion: PROTOCOL_VERSION, seed, ticks, events: [...events] }),
  };
}

/**
 * Re-runs a recording without connections. Joins and leaves at tick T happened between
 * ticks T and T+1; inputs at tick T were applied by the step that reached T.
 */
export function replay(recording: Recording, world: Pick<SessionOptions, "world">): Session {
  if (recording.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(`Gravação do protocolo ${recording.protocolVersion}; este servidor usa o protocolo ${PROTOCOL_VERSION}.`);
  }
  const session = createSession({ ...world, seed: recording.seed, log: () => {}, timeoutTicks: Infinity, clock: () => "1970-01-01T00:00:00.000Z", newToken: () => "" });
  const events = recording.events;
  let i = 0;
  for (;;) {
    while (i < events.length && events[i]!.kind !== "input" && events[i]!.tick === session.tick) {
      const event = events[i++]!;
      if (event.kind === "join") session.join(event.name, event.spawn);
      else if (event.kind === "leave") session.leave(event.playerId);
    }
    if (session.tick >= recording.ticks || session.state === "closed") break;
    while (i < events.length && events[i]!.kind === "input" && events[i]!.tick === session.tick + 1) {
      const event = events[i++]!;
      if (event.kind === "input") session.enqueue(event.playerId, event.input);
    }
    session.step();
  }
  return session;
}
