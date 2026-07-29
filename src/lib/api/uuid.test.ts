import { describe, expect, it } from "vitest";

import { isUuid } from "./uuid";

describe("isUuid", () => {
  it.each([
    // Both taken from the running catalogue: their version/variant nibbles are
    // not RFC-4122, and a stricter check would reject the real data.
    "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "92d3c8cb-443a-4501-a593-017bdc843196",
    "C3D4E5F6-A7B8-9012-CDEF-123456789012",
  ])("accepts the real id %s", (value) => {
    expect(isUuid(value)).toBe(true);
  });

  it.each([
    "not-a-uuid",
    "",
    "92d3c8cb443a4501a593017bdc843196",
    "92d3c8cb-443a-4501-a593-017bdc84319",
    "92d3c8cb-443a-4501-a593-017bdc843196x",
    "92d3c8cb-443a-4501-a593-017bdc84319g",
    " 92d3c8cb-443a-4501-a593-017bdc843196",
  ])("rejects %j", (value) => {
    expect(isUuid(value)).toBe(false);
  });

  it.each([undefined, null, 42, {}, ["92d3c8cb-443a-4501-a593-017bdc843196"]])(
    "rejects the non-string %j",
    (value) => {
      expect(isUuid(value)).toBe(false);
    },
  );
});
