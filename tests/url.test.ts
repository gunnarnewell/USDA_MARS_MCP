import { describe, expect, it } from "vitest";
import { buildMarsUrl } from "../src/mars/url";

describe("buildMarsUrl", () => {
  it("builds a URL with path and params", () => {
    const url = buildMarsUrl("https://example.com/api/", "/photos", {
      sol: 1000,
      camera: "MAST",
      tags: ["a", "b"],
    });

    expect(url).toBe(
      "https://example.com/api/photos?sol=1000&camera=MAST&tags=a&tags=b",
    );
  });
});
