import { describe, expect, it } from "vitest";
import { createJsonLogger } from "../src/util/logger.js";

describe("createJsonLogger", () => {
  it("writes structured JSON log records", () => {
    let output = "";
    const stream = {
      write(chunk: string) {
        output += chunk;
        return true;
      }
    } as NodeJS.WritableStream;
    const logger = createJsonLogger({
      name: "test",
      stream,
      now: () => new Date("2026-05-11T00:00:00.000Z")
    });

    logger.info("event_name", { request_id: "abc", status_code: 200 });

    expect(JSON.parse(output)).toEqual({
      timestamp: "2026-05-11T00:00:00.000Z",
      level: "info",
      logger: "test",
      message: "event_name",
      request_id: "abc",
      status_code: 200
    });
  });
});
