import { describe, expect, it } from "vitest";

import { MEDIA_BASE_URL } from "@/lib/config";
import { resolveCoverUrl } from "./covers";

describe("resolveCoverUrl", () => {
  it("leaves a seeded absolute URL untouched", () => {
    const seeded = "https://covers.openlibrary.org/b/isbn/9780132350884-L.jpg";

    expect(resolveCoverUrl(seeded)).toBe(seeded);
  });

  it("resolves an uploaded cover against the media origin, not the Next host", () => {
    expect(resolveCoverUrl("/media/covers/6f1e-4d24.jpg")).toBe(
      `${MEDIA_BASE_URL}/media/covers/6f1e-4d24.jpg`,
    );
  });

  it("inserts the missing slash on a path stored without one", () => {
    expect(resolveCoverUrl("media/covers/x.jpg")).toBe(`${MEDIA_BASE_URL}/media/covers/x.jpg`);
  });

  it.each([undefined, null, "", "   "])("returns null for %j, so the UI draws its placeholder", (value) => {
    expect(resolveCoverUrl(value)).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(resolveCoverUrl("  https://example.test/a.jpg  ")).toBe("https://example.test/a.jpg");
  });

  it("keeps a protocol-relative value on our own origin", () => {
    // `//evil.tld/x.jpg` is another origin to a browser. Treating it as a path
    // means a bad row in the database cannot redirect the image request off-site.
    expect(resolveCoverUrl("//evil.tld/x.jpg")).toBe(`${MEDIA_BASE_URL}//evil.tld/x.jpg`);
  });

  it("does not let a non-http scheme through", () => {
    expect(resolveCoverUrl("javascript:alert(1)")).toBe(`${MEDIA_BASE_URL}/javascript:alert(1)`);
  });
});
