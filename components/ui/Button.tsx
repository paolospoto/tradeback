import Link from "next/link";
import type { ComponentPropsWithRef, ComponentPropsWithoutRef } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

function cls(variant: Variant, size: Size, className?: string) {
  return [styles.button, styles[variant], size === "lg" ? styles.lg : "", className]
    .filter(Boolean)
    .join(" ");
}

interface Common {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ComponentPropsWithRef<"button"> & Common) {
  return <button type={type} className={cls(variant, size, className)} {...rest} />;
}

/** Link styled as a button. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof Link> & Common) {
  return <Link className={cls(variant, size, className)} {...rest} />;
}

/** Class names for elements that must look like a button (e.g. a download anchor). */
export function buttonClassName(variant: Variant = "primary", size: Size = "md"): string {
  return cls(variant, size);
}
