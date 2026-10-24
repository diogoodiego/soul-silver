import { describe, expect, it, vi } from "vitest";
import { createMemoryConnectionPair } from "../src/connection";

describe("createMemoryConnectionPair", () => {
  it("delivers messages to the other end", () => {
    const [a, b] = createMemoryConnectionPair();
    const got: unknown[] = [];
    b.onMessage((m) => got.push(m));
    a.send({ n: 1 });
    expect(got).toEqual([{ n: 1 }]);
  });

  it("notifies both ends once on close and drops later sends", () => {
    const [a, b] = createMemoryConnectionPair();
    const onA = vi.fn();
    const onB = vi.fn();
    const got = vi.fn();
    a.onClose(onA);
    b.onClose(onB);
    b.onMessage(got);
    a.close();
    b.close();
    a.send({});
    expect(onA).toHaveBeenCalledOnce();
    expect(onB).toHaveBeenCalledOnce();
    expect(got).not.toHaveBeenCalled();
  });
});
