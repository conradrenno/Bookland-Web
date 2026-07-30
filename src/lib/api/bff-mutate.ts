/**
 * The browser's half of a BFF mutation: `fetch`, read the envelope, hand back
 * either the payload or pt-BR copy.
 *
 * Lived inside `cart-client.ts` until the checkout needed the same thing with a
 * different payload type (stage 5b). Nothing in here knows about carts — same
 * move as `_shared.ts` rising out of `api/auth/` in stage 5a.
 *
 * Resolving the `code` to copy **here** rather than in the caller is deliberate:
 * every consumer is a small island — a stepper, a card button, a checkout form —
 * whose only job on failure is to show one sentence next to itself. Contrast
 * `applyApiError`, which exists because forms have per-field places to put
 * things.
 */

import { ErrorCodes, type ErrorCode } from "./error-codes";
import { GENERIC_ERROR_MESSAGE, messageForCode } from "./error-messages";
import { toErrorBody } from "@/lib/forms/apply-api-error";

export type BffResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ErrorCode;
      /** Ready to render — already pt-BR. */
      message: string;
      /**
       * The session died. The component should send the visitor to `/login`
       * rather than show a message: there is nothing they can do in place.
       */
      sessionExpired: boolean;
    };

export function bffFailure<T>(code: ErrorCode, sessionExpired = false): BffResult<T> {
  return { ok: false, code, message: messageForCode(code), sessionExpired };
}

/**
 * Calls one of our own route handlers and normalises everything that can go
 * wrong into a single result type.
 */
export async function bffMutate<T>(
  route: string,
  init: { method: string; body?: unknown },
): Promise<BffResult<T>> {
  let response: Response;
  try {
    response = await fetch(route, {
      method: init.method,
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    // Never reached the BFF — offline, connection dropped.
    return bffFailure(ErrorCodes.NETWORK_ERROR);
  }

  if (response.ok) {
    const data = (await response.json().catch(() => null)) as T | null;
    // A 2xx that does not parse means our own handler broke its contract; treat
    // it as a failure rather than handing the caller an empty payload.
    return data ? { ok: true, data } : bffFailure(ErrorCodes.INVALID_RESPONSE);
  }

  const body = toErrorBody(await response.json().catch(() => null));
  if (!body) {
    // A crash above the handler, or a proxy answering HTML.
    return {
      ok: false,
      code: ErrorCodes.UNKNOWN,
      message: GENERIC_ERROR_MESSAGE,
      sessionExpired: response.status === 401,
    };
  }

  return bffFailure(body.code, response.status === 401);
}
