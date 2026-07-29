/**
 * Places a failed BFF response onto a form: per-field messages where they
 * belong, one banner message for everything else.
 *
 * Note what crosses the wire here. The form talks to **our** route handlers, not
 * to Spring, so what arrives is the JSON of `ApiError.toResponseBody()` — plain
 * data. `ApiError` itself never leaves the server.
 *
 * Pure: the caller supplies the setter, so this is testable without React
 * (docs/specs/16-auth-pages.md).
 */

import type { ApiErrorBody } from "@/lib/api/errors";
import { ErrorCodes, type ErrorCode } from "@/lib/api/error-codes";
import { messageForCode } from "@/lib/api/error-messages";
import { PAYLOAD_LEVEL_ERROR_KEY } from "@/lib/api/problem";

/** Codes that are really about one field, even without an `errors` map. */
const CODE_TO_FIELD: Partial<Record<string, string>> = {
  [ErrorCodes.EMAIL_ALREADY_EXISTS]: "email",
};

export interface ApplyApiErrorOptions {
  /** Fields the form actually renders. Anything else has nowhere to show. */
  fields: readonly string[];
  /** Called once per field that owns a message. */
  setFieldError: (field: string, message: string) => void;
}

/** Narrows a parsed response body to the envelope our handlers send. */
export function toErrorBody(value: unknown): ApiErrorBody | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.code !== "string") return null;
  return candidate as unknown as ApiErrorBody;
}

/**
 * Distributes the error and returns the banner text, or `null` when every
 * message found a field.
 *
 * A message for a field the form does not render falls back to the banner: it is
 * better to show it in the wrong place than to swallow it and leave the user
 * staring at a form that failed for no visible reason.
 */
export function applyApiError(
  body: ApiErrorBody | null,
  { fields, setFieldError }: ApplyApiErrorOptions,
): string | null {
  if (!body) return messageForCode(undefined);

  const orphans: string[] = [];
  let placed = false;

  for (const [field, messages] of Object.entries(body.fieldErrors ?? {})) {
    const text = messages.join(" ");
    if (field !== PAYLOAD_LEVEL_ERROR_KEY && fields.includes(field)) {
      setFieldError(field, text);
      placed = true;
    } else {
      orphans.push(text);
    }
  }

  const ownerField = CODE_TO_FIELD[body.code];
  if (ownerField && fields.includes(ownerField)) {
    setFieldError(ownerField, messageForCode(body.code));
    placed = true;
  }

  if (orphans.length > 0) return orphans.join(" ");
  // Everything landed on a field — a banner repeating it would be noise.
  return placed ? null : messageForCode(body.code as ErrorCode);
}
