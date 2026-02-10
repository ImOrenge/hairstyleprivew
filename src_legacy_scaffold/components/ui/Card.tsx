import { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface CardProps {
  title?: string;
  description?: string;
  className?: string;
  children?: ReactNode;
}

export function Card({ title, description, className, children }: CardProps) {
  return (
    <section className={cn("rounded-2xl border border-gray-200 bg-white p-5", className)}>
      {title ? <h3 className="text-lg font-semibold">{title}</h3> : null}
      {description ? <p className="mt-1 text-sm text-gray-600">{description}</p> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
