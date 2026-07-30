import { cn } from "@/lib/utils";

/**
 * Form-level error message.
 *
 * `role="alert"` so a screen reader announces it when it appears — a visual-only
 * banner leaves a non-sighted user submitting into silence.
 */
export function FormAlert({ children, className }: React.ComponentProps<"p">) {
  if (!children) return null;

  return (
    <p
      role="alert"
      className={cn(
        "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive",
        className,
      )}
    >
      {children}
    </p>
  );
}
