import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-bold uppercase tracking-wide transition-all h-10 px-4 py-2 disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0",
  {
    variants: {
      variant: {
        default:
          "border-2 border-foreground bg-primary text-primary-foreground shadow-flat hover:-translate-y-px active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        destructive:
          "border-2 border-foreground bg-destructive text-destructive-foreground shadow-flat hover:-translate-y-px active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        outline:
          "border-2 border-foreground bg-surface text-foreground shadow-flat hover:-translate-y-px active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        ghost: "font-medium normal-case tracking-normal hover:bg-muted"
      }
    },
    defaultVariants: { variant: "default" }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant }), className)} {...props} />
  )
);
Button.displayName = "Button";
