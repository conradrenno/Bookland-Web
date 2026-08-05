/**
 * DTOs mirroring the Bookland OpenAPI contract (docs/bookland-openapi.json).
 * Hand-written on purpose (learning project) — keep in sync with the spec.
 * The OpenAPI is the source of truth for shapes; Linear stories for behaviour.
 */

// ---- Shared ---------------------------------------------------------------

export type UUID = string;
/** ISO-8601 date-time string, e.g. "2026-07-24T14:46:00Z". */
export type ISODateTime = string;

/** Generic Spring `PageResult<T>` wrapper. */
export interface PageResult<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

// ---- Auth / User ----------------------------------------------------------

export type UserRole = "CUSTOMER" | "ADMIN";

export interface UserViewModel {
  id: UUID;
  name: string;
  email: string;
  role: UserRole;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  active: boolean;
}

export interface TokenViewModel {
  accessToken: string;
  tokenType: string;
  accessTokenExpiresAt: ISODateTime;
  refreshToken: string;
  refreshTokenExpiresAt: ISODateTime;
}

export interface RegisterRequest {
  name: string;
  email: string;
  /** Min 8 chars, at least one digit (contract pattern `.*\d.*`). */
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface UpdateUserRequest {
  name: string;
}

// ---- Catalog: Books & Categories -----------------------------------------

export interface BookViewModel {
  id: UUID;
  title: string;
  isbn: string;
  authors: string[];
  publisher?: string;
  publicationYear?: number;
  edition?: string;
  synopsis?: string;
  price: number;
  stockQuantity: number;
  available: boolean;
  categoryId: UUID;
  /** URL da capa do livro. Opcional — pode não existir; usar placeholder. */
  coverImageUrl?: string;
  avgRating?: number;
}

export interface CategoryViewModel {
  id: UUID;
  name: string;
  bookCount: number;
}

export interface CreateBookRequest {
  title: string;
  isbn: string;
  authors: string[];
  publisher?: string;
  publicationYear?: number;
  edition?: string;
  synopsis?: string;
  price: number;
  /**
   * Required in practice despite being optional in the OpenAPI: upstream maps it
   * to a primitive `int`, so omitting it fails deserialisation with a bare
   * MALFORMED_REQUEST. Always send it. See 09-contract-notes.md item 24.
   */
  stockQuantity: number;
  categoryId: UUID;
  /**
   * Max 255 chars — `books.cover_image_url` is `varchar(255)`. Alternative:
   * upload via POST /books/{id}/cover, which stores a short relative path.
   */
  coverImageUrl?: string;
}

export type UpdateBookRequest = Partial<Omit<CreateBookRequest, "isbn">>;

/**
 * Query params accepted by `GET /api/v1/books`.
 *
 * A `type` rather than an `interface` on purpose: only the former gets an
 * implicit index signature, which is what lets it be handed straight to
 * `apiFetch`'s `QueryParams` without a cast.
 */
export type BookSearchParams = {
  q?: string;
  /** Must be a well-formed UUID — upstream answers 400 INVALID_PARAMETER otherwise. */
  category?: UUID;
  minPrice?: number;
  maxPrice?: number;
  /** Upstream default is `title`; unknown values are ignored, not rejected. */
  sort?: string;
  /** Zero-based. */
  page?: number;
  size?: number;
};

// ---- Reviews --------------------------------------------------------------

export interface ReviewViewModel {
  id: UUID;
  bookId: UUID;
  customerId: UUID;
  /** Full name of the reviewer. Anonymising for display is the front's job (US-20). */
  customerName?: string;
  rating: number;
  comment?: string;
  createdAt: ISODateTime;
}

export interface CreateReviewRequest {
  /** 1..5 */
  rating: number;
  comment?: string;
}

/** Response of `GET /api/v1/books/{bookId}/reviews`. */
export interface ReviewListViewModel {
  reviews: PageResult<ReviewViewModel>;
  averageRating: number;
  /** Map of "1".."5" star -> count. */
  ratingDistribution: Record<string, number>;
}

// ---- Cart -----------------------------------------------------------------

export interface CartItemViewModel {
  bookId: UUID;
  title: string;
  coverImageUrl?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  /** False once the book runs out of stock; adding it again yields CART_ITEM_UNAVAILABLE. */
  available: boolean;
}

export interface CartViewModel {
  id: UUID;
  customerId: UUID;
  items: CartItemViewModel[];
  total: number;
  updatedAt: ISODateTime;
}

export interface AddCartItemRequest {
  bookId: UUID;
  /**
   * Required in practice despite being optional in the OpenAPI, and with no
   * server-side default: upstream binds it to a primitive `int`, so omitting it
   * or sending `null` fails deserialisation with `400 MALFORMED_REQUEST`.
   * `addCartItem` always sends it. See 09-contract-notes.md item 26.
   */
  quantity: number;
}

export interface UpdateCartItemRequest {
  /** 0 removes the line. */
  quantity: number;
}

/**
 * The enum as a runtime list, because two places need to *iterate* it: the
 * checkout's route handler, which refuses anything outside it before calling
 * upstream, and the method picker. Deriving the type from the tuple keeps the
 * two from drifting apart.
 */
export const PAYMENT_METHODS = ["PIX", "CREDIT_CARD", "DEBIT_CARD", "PAYPAL"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface CheckoutRequest {
  paymentMethod: PaymentMethod;
}

// ---- Orders ---------------------------------------------------------------

/**
 * NOTE: this enum comes from the OpenAPI contract and is the source of truth.
 * The Linear stories mention a "PENDING" status that does NOT exist here — see
 * docs/specs/09-contract-notes.md for the reconciliation.
 */
export type OrderStatus =
  | "AWAITING_PAYMENT"
  | "CONFIRMED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "PAYMENT_FAILED";

export interface OrderItemViewModel {
  bookId: UUID;
  title: string;
  /** Snapshot of the cover at purchase time — independent of the catalogue since. */
  coverImageUrl?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface StatusTransitionViewModel {
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  changedAt: ISODateTime;
  changedBy: UUID;
}

export interface OrderViewModel {
  id: UUID;
  customerId: UUID;
  items: OrderItemViewModel[];
  status: OrderStatus;
  totalAmount: number;
  statusHistory: StatusTransitionViewModel[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface OrderSummaryViewModel {
  id: UUID;
  status: OrderStatus;
  totalAmount: number;
  itemCount: number;
  createdAt: ISODateTime;
}

/**
 * Query params accepted by `GET /api/v1/orders`.
 *
 * Just the two: the route reads **no** `sort`, by decision rather than
 * oversight. The backend serves orders newest-first everywhere and treats that
 * as contract (README, section Orders); a future "oldest first" would arrive as
 * a closed list of values, never as `?sort=field,direction`.
 * See 09-contract-notes.md item 28.
 */
export type OrderSearchParams = {
  page?: number;
  size?: number;
};

/** Admin listing row: a summary plus the owning customer (phase 2). */
export interface AdminOrderSummaryViewModel extends OrderSummaryViewModel {
  /** Only the id — the API does not expose the customer's name here. */
  customerId: UUID;
}

/** Query params accepted by `GET /api/v1/admin/orders`. See the note on `BookSearchParams`. */
export type AdminOrderSearchParams = {
  status?: OrderStatus;
  page?: number;
  size?: number;
};

export interface UpdateOrderStatusRequest {
  newStatus: OrderStatus;
  /** Derived from the token upstream; send only if the backend starts demanding it. */
  adminId?: UUID;
}

// ---- Payments -------------------------------------------------------------

export type PaymentStatus = "PENDING" | "APPROVED" | "DECLINED" | "REFUNDED";

export interface PaymentViewModel {
  id: UUID;
  orderId: UUID;
  customerId: UUID;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  gatewayTransactionId?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ---- Inventory (admin / phase 2) -----------------------------------------

export interface InventoryEntryViewModel {
  id: UUID;
  bookId: UUID;
  previousQuantity: number;
  newQuantity: number;
  delta: number;
  reason?: string;
  adjustedBy: UUID;
  adjustedAt: ISODateTime;
}

export interface AdjustInventoryRequest {
  delta: number;
  reason?: string;
}

export interface LowStockBookViewModel {
  id: UUID;
  title: string;
  isbn: string;
  coverImageUrl?: string;
  stockQuantity: number;
  /** Null for books that never had an inventory adjustment (observed on seeded data). */
  lastMovement: ISODateTime | null;
}

// ---- Wishlist (phase 2) ---------------------------------------------------

export interface WishlistItemViewModel {
  bookId: UUID;
  title: string;
  coverImageUrl?: string;
  price: number;
  stockQuantity: number;
  available: boolean;
  addedAt: ISODateTime;
}

export interface WishlistViewModel {
  customerId: UUID;
  items: WishlistItemViewModel[];
}

export interface AddWishlistItemRequest {
  bookId: UUID;
}
