import { describe, it, expect } from "vitest";
import { isPublicRequest } from "../index";
import { publicCacheTtl } from "./publicCache";

describe("new public routes", () => {
  it("GET /tour and GET /status are reachable without logging in", () => {
    expect(isPublicRequest("GET", "/tour")).toBe(true);
    expect(isPublicRequest("GET", "/status")).toBe(true);
  });
  it("only as reads: nothing is public for any other method", () => {
    for (const m of ["POST", "PUT", "DELETE", "PATCH"]) {
      expect(isPublicRequest(m, "/tour"), `${m} /tour`).toBe(false);
      expect(isPublicRequest(m, "/status"), `${m} /status`).toBe(false);
    }
  });
  it("they did not open anything beside themselves", () => {
    for (const p of ["/tour/", "/tour/x", "/status/x", "/statuses", "/tours", "/delegation", "/contribution", "/people", "/profile/1", "/notifications/inbox"]) {
      expect(isPublicRequest("GET", p), p).toBe(false);
    }
  });
});

describe("the page cache allow-list stays inside the public pages", () => {
  it("every cacheable path is public, so no member-only page can ever be cached", () => {
    const probes = ["/", "/documents", "/documents/defaults", "/documents/charter", "/documents/rules-of-procedure", "/record", "/governance-health", "/status", "/tour"];
    for (const p of probes) {
      expect(publicCacheTtl("GET", p), p).not.toBeNull();
      expect(isPublicRequest("GET", p), p).toBe(true);
    }
  });
});
