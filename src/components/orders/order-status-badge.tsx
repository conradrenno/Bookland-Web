import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/lib/api/types";
import { describeOrderStatus } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

/**
 * The order's status, in pt-BR and in colour.
 *
 * Colour is never the only carrier — the word is always there — so it reads the
 * same to someone who cannot tell the two greens apart.
 */
export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const { label, className: tone } = describeOrderStatus(status);

  return (
    <Badge variant="secondary" className={cn(tone, className)}>
      {label}
    </Badge>
  );
}
