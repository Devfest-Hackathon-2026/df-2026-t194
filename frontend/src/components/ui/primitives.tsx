import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Shadcn UI Button プリミティブ (Vercel モノクローム + Google 4色アクセント + 丸みデザイン)
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4285F4] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] select-none",
  {
    variants: {
      variant: {
        default:
          "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 shadow-sm",
        outline:
          "border border-zinc-200/80 bg-white/85 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/85 dark:text-zinc-200 dark:hover:bg-zinc-800",
        ghost:
          "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100",
        googleBlue:
          "bg-[#4285F4] text-white hover:bg-[#3367D6] shadow-sm shadow-[#4285F4]/25",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-7 px-2.5 text-xs",
        lg: "h-10 px-5 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
);
Button.displayName = "Button";

// Shadcn UI Badge プリミティブ
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors select-none",
  {
    variants: {
      variant: {
        default:
          "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
        secondary:
          "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        blue: "bg-[#4285F4]/15 text-[#4285F4] border border-[#4285F4]/30",
        green: "bg-[#34A853]/15 text-[#34A853] border border-[#34A853]/30",
        yellow: "bg-[#FBBC05]/15 text-[#d99b00] dark:text-[#FBBC05] border border-[#FBBC05]/30",
        red: "bg-[#EA4335]/15 text-[#EA4335] border border-[#EA4335]/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

// Shadcn UI Input プリミティブ
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-full border border-zinc-200/80 bg-zinc-100/70 px-3.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4285F4] dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100 dark:placeholder:text-zinc-500 transition-all",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

// フローティンググラスカードプリミティブ
export const FloatingCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-3xl border border-zinc-200/60 bg-white/75 text-zinc-950 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.1)] backdrop-blur-2xl dark:border-zinc-800/60 dark:bg-zinc-950/75 dark:text-zinc-50 dark:shadow-[0_16px_48px_-8px_rgba(0,0,0,0.6)] transition-colors duration-200",
      className
    )}
    {...props}
  />
));
FloatingCard.displayName = "FloatingCard";
