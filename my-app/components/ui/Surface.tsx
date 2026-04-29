import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface SurfaceProps extends ComponentPropsWithoutRef<"div"> {
  as?: ElementType;
  children?: ReactNode;
}

function Surface({
  as = "div",
  surfaceClassName,
  className,
  children,
  ...props
}: SurfaceProps & { surfaceClassName: string }) {
  const Component = as;

  return (
    <Component className={cn(surfaceClassName, className)} {...props}>
      {children}
    </Component>
  );
}

export function AppPage({ className, ...props }: SurfaceProps) {
  return <Surface surfaceClassName="app-page" className={className} {...props} />;
}

export function Panel({ className, ...props }: SurfaceProps) {
  return <Surface surfaceClassName="app-panel" className={className} {...props} />;
}

export function SurfaceCard({ className, ...props }: SurfaceProps) {
  return <Surface surfaceClassName="app-card" className={className} {...props} />;
}

export function InverseSection({ className, ...props }: SurfaceProps) {
  return <Surface surfaceClassName="app-inverse" className={className} {...props} />;
}

export function InverseCard({ className, ...props }: SurfaceProps) {
  return <Surface surfaceClassName="app-inverse-card" className={className} {...props} />;
}
