/**
 * Checkout and orders — `POST /api/v1/cart/checkout` plus the `/orders` family.
 *
 * Same shape as `cart.ts`: the token is a parameter rather than something read
 * from cookies here, so the module stays testable outside a request scope. The
 * exception is `parseOrderSearchParams`, which is pure and reads no token at all.
 *
 * Covers US-14 and US-18 (docs/specs/19-checkout.md), and US-15 and US-16
 * (docs/specs/20-orders-history.md).
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/config";
import { apiFetch } from "./client";
import type {
  OrderSearchParams,
  OrderSummaryViewModel,
  OrderViewModel,
  PageResult,
  PaymentMethod,
  UUID,
} from "./types";

const CHECKOUT_PATH = "/api/v1/cart/checkout";
const ORDERS_PATH = "/api/v1/orders";

/**
 * Turns the cart into an order — and, in this backend, **pays for it**.
 *
 * Verified live (2026-07-30): the response comes back `CONFIRMED`, with the
 * `AWAITING_PAYMENT → CONFIRMED` transition already in `statusHistory` and the
 * payment approved by a simulated gateway. There is no second step to call, and
 * no payment data to send: `paymentMethod` is the only field the API accepts.
 *
 * Two failures are worth knowing about, both handled by the caller rather than
 * here (09-contract-notes.md item 27):
 *
 * - **404 `CART_NOT_FOUND`** — the cart is empty. Not a 409, and it answers this
 *   even for a cart that exists with no items.
 * - **409 `CART_ITEM_UNAVAILABLE`** — stock ran out between adding and
 *   confirming. The offending book ids appear only inside the English `detail`,
 *   so nothing structured can be extracted; `GET /cart` flags the line instead.
 */
export function checkout(
  accessToken: string,
  paymentMethod: PaymentMethod,
): Promise<OrderViewModel> {
  return apiFetch<OrderViewModel>(CHECKOUT_PATH, {
    method: "POST",
    accessToken,
    body: { paymentMethod },
  });
}

/**
 * One order, with its items, totals and status history.
 *
 * Prices, titles and covers are frozen at checkout time, so what comes back is
 * what the customer bought — not what the catalogue says today.
 *
 * A missing order answers `404 ORDER_NOT_FOUND`. Someone else's order has not
 * been measured yet (it needs a second account); the page treats both as "not
 * found", which is also the right answer if it turns out to be a 403.
 */
export function getOrder(accessToken: string, orderId: UUID): Promise<OrderViewModel> {
  return apiFetch<OrderViewModel>(`${ORDERS_PATH}/${encodeURIComponent(orderId)}`, {
    accessToken,
  });
}

/**
 * US-15 — the customer's own orders, newest first.
 *
 * **Nothing here asks for that order.** The upstream sorts by `createdAt`
 * descending with ties broken by `id`, and the route reads no `sort` parameter
 * at all — sending one would be cargo cult. It got that way on 2026-08-05: the
 * query ran with no `ORDER BY`, so the newest order landed on the *last* page,
 * which is why the fix went upstream instead of becoming a reversal here.
 * Reversing a page only reorders the old ones among themselves.
 *
 * The tiebreaker matters to us more than it looks: without it, two orders
 * sharing a `createdAt` could swap places between requests, and one would vanish
 * from both pages while the other appeared in both. See 09-contract-notes.md
 * item 28.
 */
export function listOrders(
  accessToken: string,
  params: OrderSearchParams = {},
): Promise<PageResult<OrderSummaryViewModel>> {
  return apiFetch<PageResult<OrderSummaryViewModel>>(ORDERS_PATH, {
    accessToken,
    query: params,
  });
}

/**
 * US-16 — cancels an order, and gets the whole updated order back.
 *
 * `DELETE` names it badly: this answers **200 with an `OrderViewModel`**, not
 * 204, already `CANCELLED` and carrying the new `CONFIRMED → CANCELLED`
 * transition in `statusHistory`. Verified live.
 *
 * It is not a soft delete either — the order stays in the history, and the
 * payment flips to `REFUNDED` on its own because cancelling a confirmed order
 * restores stock and refunds automatically.
 *
 * Three failures the caller has to tell apart, all with stable codes:
 *
 * - **409 `ORDER_CANCELLATION_NOT_ALLOWED`** — already cancelled, or shipped.
 *   The likeliest of the three in practice: it is what a second click answers.
 * - **403 `ORDER_ACCESS_DENIED`** — someone else's order. The upstream refuses
 *   the mutation; verified that the target order survives untouched.
 * - **404 `ORDER_NOT_FOUND`** — no such id.
 */
export function cancelOrder(accessToken: string, orderId: UUID): Promise<OrderViewModel> {
  return apiFetch<OrderViewModel>(`${ORDERS_PATH}/${encodeURIComponent(orderId)}`, {
    method: "DELETE",
    accessToken,
  });
}

// ---- History URL → upstream query -----------------------------------------

/** The shape Next hands a page as `searchParams`: raw, repeatable, untrusted. */
type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Reads `/orders?page=&size=` into upstream parameters, dropping anything
 * unusable.
 *
 * The same two defences `parseBookSearchParams` needed, because `GET /orders`
 * has the same two vices (measured, item 28): it answers **400** to `page=-1`,
 * `size=0` and `page=abc`, and it **honours `?size=1000`** literally. A typo in
 * the address bar has to show the list, not an error page — and one page render
 * must not become an unbounded query.
 *
 * Deliberately duplicates four lines of `books.ts` rather than sharing a
 * `parsePage`: coupling the catalogue to orders through a helper costs more than
 * the duplication, and the two can legitimately drift.
 */
export function parseOrderSearchParams(raw: RawSearchParams = {}): OrderSearchParams {
  return {
    page: parsePage(single(raw.page)),
    size: parseSize(single(raw.size)),
  };
}

/**
 * A repeated parameter (`?page=1&page=2`) arrives as an array. Refuse the whole
 * value rather than picking one — same rule as `parseBookSearchParams`.
 */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Zero-based, matching the contract and `PageResult.page`. */
function parsePage(value: string | undefined): number {
  const page = toFiniteNumber(value);
  return page !== undefined && Number.isInteger(page) && page >= 0 ? page : 0;
}

function parseSize(value: string | undefined): number {
  const size = toFiniteNumber(value);
  if (size === undefined || !Number.isInteger(size) || size < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(size, MAX_PAGE_SIZE);
}

/** `Number("")` and `Number(" ")` are both `0`, so an empty parameter needs the guard. */
function toFiniteNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
