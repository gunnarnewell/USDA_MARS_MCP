import { describe, expect, it } from "vitest";
import { buildQuery } from "../src/mars/url.js";

describe("buildQuery", () => {
  it("builds q/sort/allSections params", () => {
    const query = buildQuery({
      q: "commodity=Feeder Cattle",
      sort: "-report_date",
      allSections: true
    });

    expect(query).toBe("?q=commodity%3DFeeder+Cattle&sort=-report_date&allSections=true");
  });

  it("keeps correctionsOnly casing", () => {
    const query = buildQuery({ correctionsOnly: true });
    expect(query).toBe("?correctionsOnly=true");
  });
});
