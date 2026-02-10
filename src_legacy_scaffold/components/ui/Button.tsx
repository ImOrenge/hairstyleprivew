import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClassMap: Record<Variant, string> = {
  primary: "bg-black text-white hover:bg-gray-800",
  secondary: "bg-white text-gray-900 border border-gray-300 hover:bg-gray-100",
  ghost: "bg-transparent text-gray-700 hover:bg-gray-100",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
          variantClassMap[variant],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
