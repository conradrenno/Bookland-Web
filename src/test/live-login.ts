/**
 * Signs in against the **running** identity service, the way a browser would,
 * for the smoke suite (docs/specs/21, stage 3).
 *
 * The password is only accepted by the identity service's own login form, so
 * this walks the authorization code flow by hand: authorize → login page →
 * form POST with its CSRF token → authorize again → code → token exchange. The
 * last step is the BFF's own `exchangeCode`, so the suite exercises it too.
 *
 * Never imported by the app — only by `*.smoke.test.ts`.
 */

import { IDENTITY_BASE_URL } from "@/lib/config";
import { register } from "@/lib/api/auth";
import type { OAuthTokenResponse } from "@/lib/api/types";
import { beginLogin, exchangeCode } from "@/lib/auth/oauth";

export interface Credentials {
  email: string;
  password: string;
}

/** A tiny cookie jar: the identity service tracks the login in `IDENTITY_SESSION`. */
class CookieJar {
  private readonly cookies = new Map<string, string>();

  store(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const separator = pair.indexOf("=");
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function step(jar: CookieJar, url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: { ...init.headers, cookie: jar.header() },
  });
  jar.store(response);
  return response;
}

function locationOf(response: Response): string {
  const location = response.headers.get("location");
  if (!location) throw new Error(`Expected a redirect, got ${response.status}`);
  return new URL(location, IDENTITY_BASE_URL).toString();
}

/** Runs the whole flow and returns the token set the BFF would store. */
export async function signInLive({ email, password }: Credentials): Promise<OAuthTokenResponse> {
  const jar = new CookieJar();
  const { pending, url } = await beginLogin("/");

  // Anonymous: the server parks the request and sends us to its login page.
  const toLogin = await step(jar, url);
  const loginPage = await step(jar, locationOf(toLogin));
  const html = await loginPage.text();
  const csrf = /name="_csrf"[^>]*value="([^"]+)"/.exec(html)?.[1];
  if (!csrf) throw new Error("No CSRF token on the identity login page");

  const afterLogin = await step(jar, `${IDENTITY_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password, _csrf: csrf }),
  });
  const resumed = locationOf(afterLogin);
  if (resumed.includes("error")) throw new Error(`Login refused for ${email}`);

  // Signed in: the parked authorization request now answers with the code.
  const toCallback = locationOf(await step(jar, resumed));
  const callback = new URL(toCallback);
  if (callback.searchParams.get("state") !== pending.state) {
    throw new Error("The authorization server echoed a different state");
  }
  const code = callback.searchParams.get("code");
  if (!code) throw new Error(`No code in the callback: ${toCallback}`);

  return exchangeCode({ code, verifier: pending.verifier });
}

/** A brand-new customer, so a run never depends on seeds or earlier runs. */
export async function freshCustomer(label: string): Promise<Credentials> {
  const credentials = {
    email: `smoke-${label}-${Date.now()}@example.com`,
    password: "smoke12345",
  };
  await register({ name: `Smoke ${label}`, ...credentials });
  return credentials;
}
