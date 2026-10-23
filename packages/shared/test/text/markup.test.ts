import { describe, expect, it } from "vitest";
import { MarkupError, parseMarkup, serializeMarkup } from "../../src/text/markup.ts";

describe("parseMarkup", () => {
  it("reads plain text as one text token", () => {
    expect(parseMarkup("Hello, world!")).toEqual([{ kind: "text", value: "Hello, world!" }]);
  });

  it.each([
    ["{n}", { kind: "newline" }],
    ["{page}", { kind: "page" }],
    ["{scroll}", { kind: "scroll" }],
    ["{pad}", { kind: "pad" }],
  ] as const)("reads %s", (text, token) => {
    expect(parseMarkup(text)).toEqual([token]);
  });

  it("reads color", () => {
    expect(parseMarkup("{color:2}")).toEqual([{ kind: "color", color: 2 }]);
  });

  it("reads a named variable without a flag", () => {
    expect(parseMarkup("{trainer-name:0}")).toEqual([
      { kind: "variable", name: "trainer-name", slot: 0, flag: 0 },
    ]);
  });

  it("reads a named variable with a flag", () => {
    expect(parseMarkup("{number3:1,2}")).toEqual([
      { kind: "variable", name: "number3", slot: 1, flag: 2 },
    ]);
  });

  it("reads a variable with an unnamed command id", () => {
    expect(parseMarkup("{var0104:1}")).toEqual([{ kind: "variable", name: "var0104", slot: 1, flag: 0 }]);
  });

  it("reads an unnamed command with parameters", () => {
    expect(parseMarkup("{cmd:FF02:1,0}")).toEqual([{ kind: "command", id: 0xff02, params: [1, 0] }]);
  });

  it("reads an unnamed command without parameters", () => {
    expect(parseMarkup("{cmd:0206}")).toEqual([{ kind: "command", id: 0x0206, params: [] }]);
  });

  it("reads a raw character code", () => {
    expect(parseMarkup("{raw:01A3}")).toEqual([{ kind: "raw", code: 0x01a3 }]);
  });

  it("reads escapes as text", () => {
    expect(parseMarkup("100% \\{braces\\} \\\\")).toEqual([{ kind: "text", value: "100% {braces} \\" }]);
  });

  it("mixes text and commands in order", () => {
    expect(parseMarkup("Hi {trainer-name:0}!{n}")).toEqual([
      { kind: "text", value: "Hi " },
      { kind: "variable", name: "trainer-name", slot: 0, flag: 0 },
      { kind: "text", value: "!" },
      { kind: "newline" },
    ]);
  });

  it.each([
    ["{", "chave sem fechar"],
    ["{foo:0}", "nome desconhecido"],
    ["{color: 02}", "forma canônica"],
    ["{color:02}", "forma canônica"],
    ["{cmd:FF00:1}", "use {color:N}"],
    ["{raw:1A3}", "4 dígitos"],
    ["{trainer-name:0,0}", "forma canônica"],
    ["a\nb", "use {n}"],
    ["stray } brace", "chave"],
    ["\\q", "escape"],
    ["{cmd:0206:}", "parâmetros"],
    ["{number3:1,0}", "forma canônica"],
    ["{trainer-name:256}", "0 a 255"],
  ])("refuses %j with a position and a problem", (text, hint) => {
    try {
      parseMarkup(text);
      expect.fail("expected MarkupError");
    } catch (error) {
      expect(error).toBeInstanceOf(MarkupError);
      const e = error as MarkupError;
      expect(e.position).toBeGreaterThanOrEqual(0);
      expect(e.problem.toLowerCase()).toContain(hint.toLowerCase());
    }
  });
});

describe("serializeMarkup", () => {
  it.each([
    "Hello, world!",
    "{n}{page}{scroll}{pad}",
    "{color:2}Red{color:0}",
    "{trainer-name:0}’s Photo",
    "{number3:1,2} lbs",
    "{var0104:1}",
    "{cmd:FF02:1,0}",
    "{cmd:0206}",
    "{raw:01A3}",
    "100% \\{braces\\} \\\\",
  ])("round trips the canonical form %j", (text) => {
    expect(serializeMarkup(parseMarkup(text))).toBe(text);
  });

  it("round trips tokens", () => {
    const tokens = parseMarkup("A{n}{trainer-name:0,3}{cmd:FF02:1,0}{raw:0001}\\}");
    expect(parseMarkup(serializeMarkup(tokens))).toEqual(tokens);
  });

  it("escapes braces and backslashes in text", () => {
    expect(serializeMarkup([{ kind: "text", value: "{x}\\" }])).toBe("\\{x\\}\\\\");
  });
});
