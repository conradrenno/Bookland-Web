import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
  /** Cross-link to the other auth page. */
  footer: React.ReactNode;
}

/**
 * Shared frame for the two auth screens: serif heading, generous breathing room,
 * no ornament — the editorial direction from docs/specs/11-style-brief.md.
 */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  // The card is roomier than the default: the style brief asks for breathing space.
  return (
    <Card className="w-full [--card-spacing:--spacing(6)]">
      <CardHeader className="space-y-1.5">
        <CardTitle className="font-serif text-2xl tracking-tight">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {children}
        <p className="text-center text-sm text-muted-foreground">{footer}</p>
      </CardContent>
    </Card>
  );
}
