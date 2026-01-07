import { describe, expect, it } from "vitest";
import { buildMarsUrl } from "../src/mars/url";

describe("buildMarsUrl", () => {
  it("preserves case-sensitive parameter names", () => {
    const url = buildMarsUrl("https://example.com/api/", "/search", {
      CaseSensitive: "Yes",
      lowercase: "no",
    });

    expect(url).toBe(
      "https://example.com/api/search?CaseSensitive=Yes&lowercase=no",
    );
  });
});
