"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { spriteUrl } from "@/lib/data/sprites";
import { t } from "@/lib/i18n";
import styles from "./HelpWizard.module.css";

/**
 * Yes/no flag saved the first time the wizard opens, so it doesn't open on its own again.
 * localStorage only: not a cookie, not an identifier, never sent anywhere.
 */
const SEEN_KEY = "tradeback:help-seen";
const HAUNTER = 93;
const GENGAR = 94;

/** Returns true the first time this browser opens the site, and remembers it. */
function firstVisit(): boolean {
  try {
    if (localStorage.getItem(SEEN_KEY)) return false;
    localStorage.setItem(SEEN_KEY, "1");
    return true;
  } catch {
    // Storage blocked (private mode, settings): don't nag on every visit.
    return false;
  }
}

function Sprite({ id, dim = false }: { id: number; dim?: boolean }) {
  return (
    <Image
      className={dim ? styles.dim : undefined}
      src={spriteUrl(id)}
      alt=""
      width={96}
      height={96}
      sizes="96px"
    />
  );
}

/** One small picture per step, always with Haunter and Gengar. */
function Art({ step }: { step: number }) {
  if (step === 0)
    return (
      <div className={styles.art}>
        <Sprite id={HAUNTER} />
        <span className={styles.save} aria-hidden="true">
          .sav
        </span>
      </div>
    );
  if (step === 1)
    return (
      <div className={styles.art}>
        <span className={styles.tile}>
          <Sprite id={HAUNTER} />
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
          <Sprite id={GENGAR} />
          <span className={styles.check} aria-hidden="true" />
        </span>
      </div>
    );
  // A short loop of the evolution: silhouettes swapping faster, a flash, then Gengar.
  return (
    <div className={`${styles.art} ${styles.artDark}`}>
      <span className={styles.evo} aria-hidden="true">
        <Image
          className={`${styles.evoMon} ${styles.evoFrom}`}
          src={spriteUrl(HAUNTER)}
          alt=""
          width={96}
          height={96}
          sizes="96px"
        />
        <Image
          className={`${styles.evoMon} ${styles.evoToSil}`}
          src={spriteUrl(GENGAR)}
          alt=""
          width={96}
          height={96}
          sizes="96px"
        />
        <Image
          className={`${styles.evoMon} ${styles.evoTo}`}
          src={spriteUrl(GENGAR)}
          alt=""
          width={96}
          height={96}
          sizes="96px"
        />
        <span className={styles.evoFlash} />
      </span>
    </div>
  );
}

/**
 * "?" button plus a 3-step modal that explains the tool with Gengar as the example.
 * Opens on its own the first time the site is visited; can always be skipped.
 */
export function HelpWizard() {
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const h = t.help;
  const steps = h.steps;
  const last = step === steps.length - 1;

  const open = () => {
    setStep(0);
    const d = ref.current;
    if (d && !d.open) d.showModal();
  };
  const close = () => ref.current?.close();

  useEffect(() => {
    // Step is already 0 on mount: just show the dialog.
    if (firstVisit()) ref.current?.showModal();
  }, []);

  return (
    <>
      <button
        type="button"
        className={styles.helpButton}
        onClick={open}
        aria-label={h.open}
        data-testid="help-button"
      >
        <span className={styles.helpGlyph} aria-hidden="true">
          ?
        </span>
        <span className={styles.helpLabel} aria-hidden="true">
          {h.open}
        </span>
      </button>
      <dialog
        ref={ref}
        className={styles.dialog}
        aria-labelledby="help-title"
        onClick={(e) => e.target === e.currentTarget && close()}
        data-testid="help-wizard"
      >
        <div className={styles.body}>
          <Art step={step} />
          <p className={styles.counter}>{h.counter(step + 1, steps.length)}</p>
          <h2 id="help-title" className={styles.title}>
            {steps[step]!.title}
          </h2>
          <p className={styles.text}>{steps[step]!.text}</p>
          <div className={styles.dots} aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s.title} className={i === step ? styles.dotOn : styles.dot} />
            ))}
          </div>
          <div className={styles.actions}>
            {last ? (
              <span />
            ) : (
              <Button variant="ghost" onClick={close} data-testid="help-skip">
                {h.skip}
              </Button>
            )}
            <div className={styles.nav}>
              {step > 0 ? (
                <Button variant="secondary" onClick={() => setStep(step - 1)}>
                  {h.back}
                </Button>
              ) : null}
              <Button onClick={() => (last ? close() : setStep(step + 1))} data-testid="help-next" autoFocus>
                {last ? h.done : h.next}
              </Button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
