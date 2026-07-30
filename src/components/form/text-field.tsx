import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TextFieldProps extends React.ComponentProps<"input"> {
  label: string;
  /** Message for this field, when it has one. */
  error?: string;
  /** Always-visible helper text, e.g. the password rule. */
  hint?: string;
}

/**
 * Label + input + message, with the ARIA wiring done once.
 *
 * `aria-describedby` is what makes the error reach a screen reader at all: red
 * text below the box is invisible to it, and `aria-invalid` alone announces
 * "invalid" without saying why.
 */
export function TextField({ label, error, hint, id, name, className, ...props }: TextFieldProps) {
  const fieldId = id ?? name;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  // The hint states a rule and the error states the same rule as broken. Showing
  // both repeats the sentence and makes the user hunt for the difference.
  const showHint = Boolean(hint) && !error;
  const describedBy = [showHint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn("h-10", className)}
        {...props}
      />
      {showHint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
