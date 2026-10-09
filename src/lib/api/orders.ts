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
 * **Starts** the checkout. It does not finish it.
 *
 * The backend runs the checkout as an asynchronous saga: this answers **202**
 * with the order `PENDING` as soon as it begins. Reserving the stock and
 * charging happen afterwards, and the outcome arrives as the order's `status`
 * seconds later — `CONFIRMED`, `REJECTED` (the stock ran out meanwhile) or
 * `PAYMENT_FAILED` — readable with `getOrder` (docs/specs/21). The cart is only
 * emptied on `CONFIRMED`. `paymentMethod` is still the only field accepted.
 *
 * What fails synchronously, before anything starts, all handled by the caller:
 *
 * - **409 `CART_EMPTY`** — nothing to buy (it used to be a 404 `CART_NOT_FOUND`).
 * - **409 `CART_ITEM_UNAVAILABLE`** — the shortage is visible already; `GET
 *   /cart` flags the line.
 * - **409 `CHECKOUT_IN_PROGRESS`** — an earlier checkout of this customer has
 *   not finished.
 * - **503 `CATALOG_UNAVAILABLE`** — the catalogue could not be asked. Retry.
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
 * One order, with its items, totals, status history and — once the checkout
 * ended badly — the `statusReason`.
 *
 * Prices, titles and covers are frozen at checkout time, so what comes back is
 * what the customer bought — not what the catalogue says today.
 *
 * A missing order answers `404 ORDER_NOT_FOUND`, someone else's `403
 * ORDER_ACCESS_DENIED`; callers treat both as "not found".
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
 * transition in `statusHistory`.
 *
 * It is not a soft delete either — the order stays in the history. The stock
 * goes back and a refund starts, asynchronously: the payment moves to
 * `REFUND_PENDING`, then `REFUNDED` (docs/specs/21).
 *
 * Three failures the caller has to tell apart, all with stable codes:
 *
 * - **409 `ORDER_CANCELLATION_NOT_ALLOWED`** — anything but `CONFIRMED`: still
 *   in checkout, already cancelled, or shipped. The likeliest of the three in
 *   practice: it is what a second click answers.
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
