import { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { InverseCard, Panel, SurfaceCard } from "./Surface";

interface CardProps {
  title?: string;
  description?: string;
  className?: string;
  children?: ReactNode;
  variant?: "panel" | "card" | "inverse";
}

const surfaceByVariant = {
  panel: Panel,
  card: SurfaceCard,
  inverse: InverseCard,
};

export function Card({ title, description, className, children, variant = "panel" }: CardProps) {
  const Surface = surfaceByVariant[variant];
  const isInverse = variant === "inverse";

  return (
    <Surface as="section" className={cn("p-5", className)}>
      {title ? (
        <h3 className={cn("text-lg font-black tracking-tight", isInverse ? "text-[var(--app-inverse-text)]" : "text-[var(--app-text)]")}>
          {title}
        </h3>
      ) : null}
      {description ? (
        <p className={cn("mt-1 text-sm leading-6", isInverse ? "app-inverse-muted" : "text-[var(--app-muted)]")}>
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </Surface>
  );
}
