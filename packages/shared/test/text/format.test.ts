import { describe, expect, it } from "vitest";
import { formatText, screenText, TextFormatError, textVariables } from "../../src/text/format.ts";

describe("formatText", () => {
  it("fills a named variable", () => {
    expect(formatText("{trainer-name:0}’s Photo", { "trainer-name:0": "Red" })).toBe("Red’s Photo");
  });

  it("throws naming the id and the missing variable", () => {
    try {
      formatText("{trainer-name:0} and {pokemon-name:1}", { "trainer-name:0": "Red" }, "0000:10");
      expect.fail("expected TextFormatError");
    } catch (error) {
      expect(error).toBeInstanceOf(TextFormatError);
      const e = error as TextFormatError;
      expect(e.id).toBe("0000:10");
      expect(e.variable).toBe("pokemon-name:1");
    }
  });

  it("refuses a value the text does not use", () => {
    expect(() => formatText("Hi!", { "trainer-name:0": "Red" })).toThrow(TextFormatError);
  });

  it("uses the same value for a repeated variable", () => {
    expect(formatText("{trainer-name:0} met {trainer-name:0}", { "trainer-name:0": "Red" })).toBe("Red met Red");
  });

  it("accepts numbers and numeric strings for number variables", () => {
    expect(formatText("{number3:0} lbs", { "number3:0": 12 })).toBe("12 lbs");
    expect(formatText("{number3:0} lbs", { "number3:0": "12" })).toBe("12 lbs");
  });

  it("passes layout markup through unchanged", () => {
    expect(formatText("A{n}B{page}C{scroll}{color:1}D{color:0}{cmd:FF02:1,0}{raw:01A3}", {})).toBe(
      "A{n}B{page}C{scroll}{color:1}D{color:0}{cmd:FF02:1,0}{raw:01A3}",
    );
  });

  it("keeps escapes for the dialog box", () => {
    expect(formatText("100% \\{x\\}", {})).toBe("100% \\{x\\}");
  });

  it("escapes a value that contains braces so it is not read as a command", () => {
    expect(formatText("Hi {trainer-name:0}", { "trainer-name:0": "{color:1}" })).toBe("Hi \\{color:1\\}");
  });

  it("keys a variable by name and slot, ignoring its flag", () => {
    expect(formatText("{trainer-name:0,2}", { "trainer-name:0": "Red" })).toBe("Red");
  });
});

describe("textVariables", () => {
  it("lists keys once, in order", () => {
    expect(textVariables("{trainer-name:0} {pokemon-name:1} {trainer-name:0}{number3:2}")).toEqual([
      "trainer-name:0",
      "pokemon-name:1",
      "number3:2",
    ]);
  });
});

describe("screenText", () => {
  it("turns line, page and scroll breaks into a space", () => {
    expect(screenText("A{n}B{page}C{scroll}D")).toBe("A B C D");
  });

  it("drops colors and commands and keeps variables literal", () => {
    expect(screenText("{color:1}Egg{color:0}{cmd:FF02:1,0} {trainer-name:0}")).toBe("Egg {trainer-name:0}");
  });

  it("collapses repeated spaces and unescapes braces", () => {
    expect(screenText("a\\{b\\}   c{pad}d")).toBe("a{b} c d");
  });
});
