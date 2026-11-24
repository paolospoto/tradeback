"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { spriteUrl } from "@/lib/data/sprites";
import { t } from "@/lib/i18n";
import styles from "./EvolutionAnimation.module.css";

export interface AnimationStep {
  from: number;
  to: number;
  /** Name shown before the evolution (nickname or species name). */
  fromName: string;
  /** Species name of the evolved form. */
  toName: string;
}

type Stage = "evolving" | "flash" | "done";

const EVOLVE_MS = 4200;
const FLASH_MS = 700;
/** Pause on each result before moving on to the next Pokémon. */
const HOLD_MS = 1800;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Original evolution sequence, shown inline in the page: alternating white
 * silhouettes that speed up, a flash, then the evolved sprite and the
 * congratulations text. Moves to the next Pokémon on its own; "Skip" jumps to
 * the end. Once the last one is revealed, `footer` is shown under the stage.
 */
export default function EvolutionAnimation({ steps, footer }: { steps: AnimationStep[]; footer: ReactNode }) {
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>(() => (prefersReducedMotion() ? "done" : "evolving"));
  const footerRef = useRef<HTMLDivElement>(null);
  const step = steps[index]!;
  const last = index === steps.length - 1;
  const finished = last && stage === "done";

  const next = () => {
    setIndex((i) => Math.min(i + 1, steps.length - 1));
    setStage(prefersReducedMotion() ? "done" : "evolving");
  };

  useEffect(() => {
    const delay = stage === "evolving" ? EVOLVE_MS : stage === "flash" ? FLASH_MS : last ? null : HOLD_MS;
    if (delay === null) return;
    const id = window.setTimeout(
      () => (stage === "evolving" ? setStage("flash") : stage === "flash" ? setStage("done") : next()),
      delay,
    );
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, index, last]);

  useEffect(() => {
    if (finished) footerRef.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [finished]);

  const revealed = stage === "done";
  const text = revealed
    ? t.editor.animation.congrats(step.fromName, step.toName)
    : t.editor.animation.what(step.fromName);

  return (
    <section className={styles.panel} aria-label={text} data-testid="evolution-animation">
      <div className={`${styles.stage} ${revealed ? styles.revealed : ""}`} key={index}>
        <Image
          className={`${styles.mon} ${styles.silhouette} ${styles.from}`}
          src={spriteUrl(step.from)}
          alt=""
          width={240}
          height={240}
          priority
        />
        <Image
          className={`${styles.mon} ${styles.silhouette} ${styles.to}`}
          src={spriteUrl(step.to)}
          alt={revealed ? step.toName : ""}
          width={240}
          height={240}
          priority
        />
        <div className={`${styles.flash} ${stage === "flash" ? styles.flashing : ""}`} />
        {steps.length > 1 ? (
          <span className={styles.counter}>
            {index + 1}/{steps.length}
          </span>
        ) : null}
      </div>
      <p className={styles.text} aria-live="polite">
        {text}
      </p>
      {finished ? (
        <div ref={footerRef} className={styles.footer}>
          {footer}
        </div>
      ) : (
        <div className={styles.controls}>
          {revealed ? (
            <Button variant="secondary" onClick={next} data-testid="animation-next">
              {t.editor.animation.next}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => {
              setIndex(steps.length - 1);
              setStage("done");
            }}
            data-testid="animation-skip"
          >
            {t.editor.animation.skip}
          </Button>
        </div>
      )}
    </section>
  );
}
