/**
 * Why a login did not complete — what the callback puts in `/login?error=`,
 * and what the login page reads back out of it.
 *
 * Pure data, shared by a route handler and a page.
 */

/**
 * - `denied` — the login was declined at the identity service.
 * - `expired` — no matching login in flight: the ten minutes ran out, the
 *   login started in another browser or on another host, or the `state` was
 *   forged.
 * - `unavailable` — the identity service could not be reached.
 * - `failed` — anything else; the details are only in the server log.
 */
export type LoginFailure = "denied" | "expired" | "unavailable" | "failed";

const MESSAGES: Record<LoginFailure, string> = {
  denied: "O login foi cancelado.",
  expired: "Seu login expirou antes de terminar. Tente de novo.",
  unavailable: "O serviço de login está fora do ar. Tente novamente em instantes.",
  failed: "Não foi possível concluir o login. Tente novamente.",
};

/** The message for a `?error=` value, or `null` when there is none worth showing. */
export function loginFailureMessage(raw: string | string[] | undefined): string | null {
  if (typeof raw !== "string") return null;
  // `in` would also accept "toString" and friends from the prototype.
  return Object.hasOwn(MESSAGES, raw) ? MESSAGES[raw as LoginFailure] : MESSAGES.failed;
}
