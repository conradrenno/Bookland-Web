import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmptyOrders } from "@/components/orders/empty-orders";
import { OrderSummaryCard } from "@/components/orders/order-summary-card";
import { Pagination } from "@/components/ui/pagination";
import { loginHref } from "@/lib/auth/next-path";
import { isApiError } from "@/lib/api/errors";
import { listOrders, parseOrderSearchParams } from "@/lib/api/orders";
import type { OrderSummaryViewModel, PageResult } from "@/lib/api/types";
import { getAccessToken } from "@/lib/auth/server";

/** Where an unusable session is sent — same shape as the cart's. */
const SIGN_IN_PATH = loginHref("/orders");

interface OrdersPageProps {
  /** Only `page` and `size` are read; anything else is ignored. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  title: "Meus pedidos",
  // One customer's purchase history — nothing for an index to hold.
  robots: { index: false, follow: false },
};

/**
 * US-15 — the order history.
 *
 * SSR, with the state in the URL: `?page=` is the only control, and changing it
 * re-renders on the server. No client JavaScript takes part, which is why the
 * pager is plain links (docs/specs/20-orders-history.md).
 *
 * **Nothing here sorts.** The upstream serves newest-first — `createdAt`
 * descending, ties broken by `id` — since the backend fixed it on 2026-08-05.
 * Re-sorting here would fight that, and re-sorting a *page* would be worse than
 * useless: it would only reorder whichever slice arrived.
 */
export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = parseOrderSearchParams(await searchParams);
  const result = await readOrders(params);

  // Bounced from here rather than from inside the `try`, which is what Next asks
  // for — `redirect()` works by throwing.
  if (result === "no-session") redirect(SIGN_IN_PATH);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Meus pedidos</h1>
        {result.totalElements > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            {describeTotal(result.totalElements)}
          </p>
        )}
      </header>

      {/* Also covers `?page=99`, which the upstream answers with an empty page
          rather than a 404 — a hand-edited page number lands here, not on an
          error screen. */}
      {result.content.length === 0 ? (
        <EmptyOrders />
      ) : (
        <>
          <ul className="space-y-3">
            {result.content.map((order) => (
              <OrderSummaryCard key={order.id} order={order} />
            ))}
          </ul>

          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            hrefFor={ordersHref}
            label="Paginação dos pedidos"
          />
        </>
      )}
    </div>
  );
}

/**
 * The history page URL. The first page carries no parameter, so the default
 * never shows up in the address bar — same rule `buildCatalogHref` follows.
 */
function ordersHref(page: number): string {
  return page <= 0 ? "/orders" : `/orders?page=${page}`;
}

/**
 * The page of orders, or the word `"no-session"` for the caller to act on.
 *
 * `/orders` is in `PROTECTED_PREFIXES`, so the middleware normally turns
 * anonymous visitors away before this runs. Two gaps it cannot close reach here:
 * a cookie that exists but no longer decodes, and a token that expires between
 * the middleware and this render. Both mean "sign in again", not "the store is
 * broken", so neither should reach `error.tsx`.
 */
async function readOrders(
  params: ReturnType<typeof parseOrderSearchParams>,
): Promise<PageResult<OrderSummaryViewModel> | "no-session"> {
  const accessToken = await getAccessToken();
  if (!accessToken) return "no-session";

  try {
    return await listOrders(accessToken, params);
  } catch (error) {
    // `isSessionProblem`, not a bare 401: Spring's `/error` dispatch can wear a
    // 401 while actually being a crash, and bouncing someone to the login page
    // over a server fault would hide the real failure. Anything else travels up.
    if (isApiError(error) && error.isSessionProblem) return "no-session";
    throw error;
  }
}

function describeTotal(total: number): string {
  return total === 1 ? "1 pedido" : `${total} pedidos`;
}
