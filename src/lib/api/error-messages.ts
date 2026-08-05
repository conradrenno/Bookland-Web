/**
 * `code` -> pt-BR copy shown to the user.
 *
 * Branching on `code` and never on the upstream `detail`: the backend documents
 * `detail` as reword-able at any time, and it is written in English for a
 * developer, not for a customer (docs/specs/15-code-conventions.md).
 *
 * Pure data — importable from Client Components.
 */

import { ErrorCodes, type ErrorCode } from "./error-codes";

/** Used whenever the failure is ours to fix and the user can only retry. */
export const GENERIC_ERROR_MESSAGE = "Estamos com um problema. Tente novamente.";

const MESSAGES: Partial<Record<string, string>> = {
  // Authentication
  [ErrorCodes.INVALID_CREDENTIALS]: "E-mail ou senha incorretos.",
  [ErrorCodes.EMAIL_ALREADY_EXISTS]: "Este e-mail já está cadastrado.",
  [ErrorCodes.TOKEN_MISSING]: "Faça login para continuar.",
  [ErrorCodes.TOKEN_INVALID]: "Sua sessão expirou. Faça login novamente.",
  [ErrorCodes.TOKEN_EXPIRED]: "Sua sessão expirou. Faça login novamente.",
  [ErrorCodes.INVALID_REFRESH_TOKEN]: "Sua sessão expirou. Faça login novamente.",
  [ErrorCodes.INSUFFICIENT_ROLE]: "Você não tem acesso a este recurso.",

  // Cart. `CART_ITEM_UNAVAILABLE` covers both "sold out" and "we have fewer
  // than you asked for" — the upstream uses one code for the two, and its
  // `detail` carries the available count in English, which we do not surface.
  [ErrorCodes.CART_ITEM_UNAVAILABLE]: "Não temos essa quantidade em estoque.",
  [ErrorCodes.INSUFFICIENT_STOCK]: "Não temos essa quantidade em estoque.",
  [ErrorCodes.BOOK_NOT_IN_CART]: "Este item não está mais no seu carrinho.",
  [ErrorCodes.CART_NOT_FOUND]: "Seu carrinho está vazio.",
  [ErrorCodes.BOOK_NOT_FOUND]: "Este livro não está mais no catálogo.",
  // Orders. `ORDER_ACCESS_DENIED` (403, someone else's order) deliberately
  // shares the copy of the 404: telling a stranger "you may not see this" would
  // confirm that the id is a real order, and the customer cannot act on the
  // difference anyway (docs/specs/20-orders-history.md).
  [ErrorCodes.ORDER_NOT_FOUND]: "Pedido não encontrado.",
  [ErrorCodes.ORDER_ACCESS_DENIED]: "Pedido não encontrado.",
  [ErrorCodes.ORDER_CANCELLATION_NOT_ALLOWED]: "Este pedido não pode mais ser cancelado.",

  // Request shape
  [ErrorCodes.VALIDATION_ERROR]: "Verifique os campos destacados.",
  [ErrorCodes.INVALID_PARAMETER]: "Verifique os campos destacados.",
  [ErrorCodes.MALFORMED_REQUEST]: "Não foi possível enviar o formulário. Tente novamente.",

  // Transport
  [ErrorCodes.NETWORK_ERROR]: "Não foi possível conectar. Verifique sua internet e tente novamente.",
  [ErrorCodes.TIMEOUT]: "O servidor demorou para responder. Tente novamente.",
};

/**
 * The message for a code, falling back to the generic one.
 *
 * Unknown codes deliberately do **not** surface the upstream text: a code we
 * have never seen also has copy we have never reviewed.
 */
export function messageForCode(code: ErrorCode | undefined): string {
  return (code !== undefined && MESSAGES[code]) || GENERIC_ERROR_MESSAGE;
}
