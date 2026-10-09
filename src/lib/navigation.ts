/**
 * A full browser navigation, as opposed to the App Router's client-side one.
 *
 * Needed wherever the destination ends on another origin — signing in goes
 * through `/api/auth/login`, which redirects to the identity service, and
 * `router.push` cannot follow that (docs/specs/21).
 *
 * Its own module so tests can mock it: jsdom does not let `window.location`
 * be replaced.
 */
export function navigateTo(href: string): void {
  window.location.assign(href);
}
