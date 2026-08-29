import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/lib/utils/variants";

/** Matches legacy `.secondary-action` — bordered mono control buttons. */
export function SecondaryActionButton({
  className,
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ intent: "secondary" }), className)}
      {...props}
    />
  );
}
