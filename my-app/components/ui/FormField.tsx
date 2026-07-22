import type { ReactNode } from "react";
import { useId } from "react";
import { cn } from "../../lib/utils";

export interface FormFieldControlProps {
  id: string;
  required?: boolean;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-errormessage"?: string;
}

export interface FormFieldProps {
  label: ReactNode;
  children: (controlProps: FormFieldControlProps) => ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function FormField({
  label,
  children,
  description,
  error,
  required = false,
  disabled = false,
  id,
  className,
}: FormFieldProps) {
  const generatedId = useId().replaceAll(":", "");
  const controlId = id ?? `field-${generatedId}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const state = disabled ? "disabled" : error ? "invalid" : "ready";

  return (
    <div
      className={cn("c-form-field", className)}
      data-invalid={error ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      data-state={state}
    >
      <label className="c-form-field__label" htmlFor={controlId}>
        {label}
        {required ? (
          <span className="c-form-field__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {description ? (
        <p id={descriptionId} className="c-form-field__description">
          {description}
        </p>
      ) : null}
      <div className="c-form-field__control">
        {children({
          id: controlId,
          required: required || undefined,
          disabled: disabled || undefined,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
          "aria-errormessage": errorId,
        })}
      </div>
      {error ? (
        <p id={errorId} className="c-form-field__error" aria-live="polite" aria-atomic="true">
          {error}
        </p>
      ) : null}
    </div>
  );
}
