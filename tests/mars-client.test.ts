import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { MarsClient } from "../src/mars/client.js";

const BASE_HOST = "https://marsapi.ams.usda.gov";

describe("MarsClient", () => {
  let mockAgent: MockAgent;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    mockAgent.close();
  });

  it("retries on 429 and succeeds", async () => {
    const client = new MarsClient("test-key");
    const pool = mockAgent.get(BASE_HOST);

    let callCount = 0;
    pool
      .intercept({ path: "/services/v1.2/reports", method: "GET" })
      .reply(() => {
        callCount += 1;
        if (callCount === 1) {
          return { statusCode: 429, data: { error: "rate limit" } };
        }
        return { statusCode: 200, data: [{ slug_id: "1", slug_name: "abc", report_name: "Report" }] };
      })
      .persist();

    const response = await client.getJson("/reports");
    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
  });
});
