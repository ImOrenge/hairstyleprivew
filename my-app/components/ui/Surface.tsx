import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "../../lib/utils";

type SurfaceOwnProps<T extends ElementType> = {
  as?: T;
  className?: string;
  children?: ReactNode;
};

export type SurfaceProps<T extends ElementType = "div"> = SurfaceOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof SurfaceOwnProps<T>>;

type SurfaceVariant = "page" | "panel" | "card" | "inverse" | "inverse-card";

type InternalSurfaceProps = SurfaceProps<ElementType> & {
  surface: SurfaceVariant;
  surfaceClassName: string;
};

function Surface({
  as,
  surface,
  surfaceClassName,
  className,
  children,
  ...props
}: InternalSurfaceProps) {
  const Component: ElementType = as ?? "div";
  const supportsPointerGlow = surface !== "page";

  return (
    <Component
      {...props}
      className={cn("c-surface", surfaceClassName, className)}
      data-pointer-glow={supportsPointerGlow ? "surface" : undefined}
      data-surface={surface}
    >
      {children}
    </Component>
  );
}

export function AppPage<T extends ElementType = "div">({ className, ...props }: SurfaceProps<T>) {
  return <Surface surface="page" surfaceClassName="app-page" className={className} {...props} />;
}

export function Panel<T extends ElementType = "div">({ className, ...props }: SurfaceProps<T>) {
  return <Surface surface="panel" surfaceClassName="app-panel" className={className} {...props} />;
}

export function SurfaceCard<T extends ElementType = "div">({ className, ...props }: SurfaceProps<T>) {
  return <Surface surface="card" surfaceClassName="app-card" className={className} {...props} />;
}

export function InverseSection<T extends ElementType = "div">({ className, ...props }: SurfaceProps<T>) {
  return <Surface surface="inverse" surfaceClassName="app-inverse" className={className} {...props} />;
}

export function InverseCard<T extends ElementType = "div">({ className, ...props }: SurfaceProps<T>) {
  return <Surface surface="inverse-card" surfaceClassName="app-inverse-card" className={className} {...props} />;
}
