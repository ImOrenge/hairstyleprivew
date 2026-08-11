import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../../lib/utils";

export type LandingSceneLayout =
  | "rolling-rail"
  | "sticky-stage"
  | "editorial-split"
  | "typographic-index"
  | "closing-stage";

export type LandingSceneTone = "canvas" | "inverse" | "quiet";
export type LandingSceneMotion = "none" | "reveal" | "scroll-progress" | "continuous";

interface LandingSceneProps extends Omit<ComponentPropsWithoutRef<"section">, "children"> {
  id: string;
  number?: string;
  layout: LandingSceneLayout;
  tone?: LandingSceneTone;
  motion?: LandingSceneMotion;
  children: ReactNode;
}

interface SceneHeaderProps extends Omit<ComponentPropsWithoutRef<"header">, "title"> {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "start" | "center";
}

export function LandingScene({
  id,
  number,
  layout,
  tone = "canvas",
  motion = "reveal",
  className,
  children,
  ...props
}: LandingSceneProps) {
  return (
    <section
      {...props}
      id={id}
      className={cn("f-landing-scene", className)}
      data-landing-surface
      data-layout={layout}
      data-motion={motion}
      data-tone={tone}
    >
      {number ? (
        <span
          className="f-landing-scene__number"
          aria-hidden="true"
          data-reveal-item
          data-reveal-order="0"
        >
          {number}
        </span>
      ) : null}
      <div className="f-landing-scene__inner">{children}</div>
    </section>
  );
}

export function SceneHeader({
  eyebrow,
  title,
  description,
  align = "start",
  className,
  ...props
}: SceneHeaderProps) {
  return (
    <header {...props} className={cn("f-scene-header", className)} data-align={align}>
      <p className="f-scene-header__eyebrow" data-reveal-item data-reveal-order="1">
        {eyebrow}
      </p>
      <h2 className="f-scene-header__title" data-reveal-item data-reveal-order="2">
        {title}
      </h2>
      {description ? (
        <p className="f-scene-header__description" data-reveal-item data-reveal-order="3">
          {description}
        </p>
      ) : null}
    </header>
  );
}
