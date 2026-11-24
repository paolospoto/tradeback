import type { ComponentPropsWithRef, ElementType } from "react";
import styles from "./Card.module.css";

type Props<T extends ElementType> = {
  as?: T;
  variant?: "default" | "subtle" | "inverse";
} & ComponentPropsWithRef<T>;

/** Flat bordered surface used for the panels of the site. */
export function Card<T extends ElementType = "div">({
  as,
  variant = "default",
  className,
  ...rest
}: Props<T>) {
  const Tag = (as ?? "div") as ElementType;
  const v = variant === "subtle" ? styles.subtle : variant === "inverse" ? styles.inverse : "";
  return <Tag className={[styles.card, v, className].filter(Boolean).join(" ")} {...rest} />;
}
