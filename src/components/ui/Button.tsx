import { forwardRef } from "react";
import Link from "next/link";

type Variant = "primary" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium rounded-xl " +
  "transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white shadow-soft hover:bg-accent600 hover:shadow-lift active:translate-y-px",
  ghost: "bg-surface text-ink shadow-soft hover:bg-tint",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[15px]",
  lg: "h-14 px-7 text-base",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
}

type ButtonProps = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = "Button";

type LinkButtonProps = CommonProps &
  React.ComponentProps<typeof Link>;

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
