/**
 * Parse size string into array of [width, height] tuples
 *
 * Supported formats:
 * - JSON array: "[[300,250],[728,90]]"
 * - Single size: "300x250"
 * - Multiple sizes: "300x250,728x90,160x600"
 */
export function parseSizes(value: string | null | undefined): number[][] {
  if (!value) return [];

  const trimmed = value.trim();

  // Try JSON array first
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        // Handle both [[300,250]] and [300,250]
        if (parsed.length === 2 && typeof parsed[0] === "number") {
          return [parsed as number[]];
        }
        return parsed as number[][];
      }
    } catch (e) {
      console.warn(
        "[ad-unit] parseSizes: invalid JSON, falling through to WxH parser",
        e,
      );
    }
  }

  // Parse "300x250" or "300x250,728x90" format
  return trimmed.split(",").flatMap((size) => {
    const parts = size.trim().toLowerCase().split("x").map(Number);
    const w = parts[0];
    const h = parts[1];
    if (
      w === undefined ||
      h === undefined ||
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w <= 0 ||
      h <= 0
    ) {
      if (size.trim() !== "") {
        console.warn(
          `[ad-unit] parseSizes: skipping invalid size "${size.trim()}"`,
        );
      }
      return [];
    }
    return [[w, h]];
  });
}

/**
 * Serialize sizes array to string for attribute
 */
export function serializeSizes(sizes: number[][]): string {
  return JSON.stringify(sizes);
}
