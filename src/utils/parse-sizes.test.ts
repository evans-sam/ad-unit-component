import { describe, expect, spyOn, test } from "bun:test";
import { parseSizes, serializeSizes } from "./parse-sizes";

describe("parseSizes", () => {
  test("parses JSON array format", () => {
    expect(parseSizes("[[300,250],[728,90]]")).toEqual([
      [300, 250],
      [728, 90],
    ]);
  });

  test("parses single JSON array", () => {
    expect(parseSizes("[[300,250]]")).toEqual([[300, 250]]);
  });

  test("parses flat JSON array as single size", () => {
    expect(parseSizes("[300,250]")).toEqual([[300, 250]]);
  });

  test("parses single size shorthand", () => {
    expect(parseSizes("300x250")).toEqual([[300, 250]]);
  });

  test("parses multiple sizes shorthand", () => {
    expect(parseSizes("300x250,728x90,160x600")).toEqual([
      [300, 250],
      [728, 90],
      [160, 600],
    ]);
  });

  test("handles whitespace", () => {
    expect(parseSizes("  300x250 , 728x90  ")).toEqual([
      [300, 250],
      [728, 90],
    ]);
  });

  test("handles uppercase X", () => {
    expect(parseSizes("300X250")).toEqual([[300, 250]]);
  });

  test("returns empty array for null", () => {
    expect(parseSizes(null)).toEqual([]);
  });

  test("returns empty array for undefined", () => {
    expect(parseSizes(undefined)).toEqual([]);
  });

  test("returns empty array for empty string", () => {
    expect(parseSizes("")).toEqual([]);
  });

  test("skips invalid WxH entries with trailing comma", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    expect(parseSizes("300x250,")).toEqual([[300, 250]]);
    warnSpy.mockRestore();
  });

  test("returns empty array for non-numeric WxH", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    expect(parseSizes("abcxdef")).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("skips entries with zero dimensions", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    expect(parseSizes("0x250")).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("skips entries with negative dimensions", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    expect(parseSizes("-300x250")).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("warns and falls through on invalid JSON", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    // Invalid JSON with opening bracket triggers JSON path first
    parseSizes("[[300,250]");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("serializeSizes", () => {
  test("serializes to JSON array", () => {
    expect(
      serializeSizes([
        [300, 250],
        [728, 90],
      ]),
    ).toBe("[[300,250],[728,90]]");
  });

  test("serializes single size", () => {
    expect(serializeSizes([[300, 250]])).toBe("[[300,250]]");
  });

  test("serializes empty array", () => {
    expect(serializeSizes([])).toBe("[]");
  });
});
