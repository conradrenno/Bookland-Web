import { describe, expect, it } from "vitest";

import { buildUrl } from "./url";

const BASE = "http://localhost:8080";

describe("buildUrl", () => {
  it("joins base and path without duplicating or dropping slashes", () => {
    expect(buildUrl(BASE, "/api/v1/books")).toBe(`${BASE}/api/v1/books`);
    expect(buildUrl(BASE, "api/v1/books")).toBe(`${BASE}/api/v1/books`);
  });

  it("omits query entries that are undefined or null", () => {
    const url = buildUrl(BASE, "/api/v1/books", {
      q: "clean",
      category: undefined,
      minPrice: null,
      page: 0,
    });

    // page=0 must survive: it is falsy but meaningful — the first page.
    expect(url).toBe(`${BASE}/api/v1/books?q=clean&page=0`);
  });

  it("keeps false as a real value", () => {
    expect(buildUrl(BASE, "/x", { flag: false })).toBe(`${BASE}/x?flag=false`);
  });

  it("repeats the key for array values, which is what Spring binds to a List", () => {
    expect(buildUrl(BASE, "/x", { tag: ["a", "b"] })).toBe(`${BASE}/x?tag=a&tag=b`);
  });

  it("drops nullish entries inside an array too", () => {
    expect(buildUrl(BASE, "/x", { tag: ["a", undefined, "b"] })).toBe(`${BASE}/x?tag=a&tag=b`);
  });

  it("percent-encodes user input", () => {
    expect(buildUrl(BASE, "/api/v1/books", { q: "c & c++" })).toContain("q=c+%26+c%2B%2B");
  });

  it("tolerates a base URL with a trailing slash", () => {
    expect(buildUrl(`${BASE}/`, "/api/v1/books")).toBe(`${BASE}/api/v1/books`);
  });
});
