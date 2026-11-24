"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button, buttonClassName } from "@/components/ui/Button";
import { spriteUrl } from "@/lib/data/sprites";
import { GAME_NAMES } from "@/lib/data/games";
import {
  evolvedFileName,
  openSave,
  SaveError,
  slotKey,
  type EvolutionPreview,
  type EvolutionStatus,
  type OpenedSave,
  type PokemonEntry,
} from "@/lib/save";
import { t } from "@/lib/i18n";
import { Dropzone } from "./Dropzone";
import { itemLabel, speciesLabel, type NameTables } from "./names";
import styles from "./editor.module.css";

// The animation is only needed at the end of the flow: keep it out of the initial bundle.
const EvolutionAnimation = dynamic(() => import("@/components/evolution/EvolutionAnimation"), { ssr: false });

interface Loaded {
  opened: OpenedSave;
  fileName: string;
}

type Phase =
  | { name: "list" }
  | { name: "evolved"; previews: EvolutionPreview[]; url: string; fileName: string }
  | { name: "verifyFailed"; problems: string[] };

type LoadError = { message: string; detail?: string; unknown?: boolean };

function errorMessage(err: unknown): LoadError {
  if (err instanceof SaveError) {
    // For an unsupported version the adapter's own message names the game.
    const message =
      err.code === "unsupported-version"
        ? `${t.editor.errors[err.code]} ${err.message}`
        : t.editor.errors[err.code];
    return { message, detail: err.message, unknown: err.code === "unknown-format" };
  }
  return { message: t.editor.errors.unexpected, detail: String(err) };
}

function reasonText(status: Extract<EvolutionStatus, { kind: "blocked" }>, names: NameTables): string {
  const r = t.editor.reasons;
  if (status.reason === "missing-item")
    return r["missing-item"](status.rules.map((rule) => itemLabel(names, rule.item!)).join(" or "));
  return r[status.reason];
}

/**
 * The only client island of the app: reads the save, lists the Pokémon that
 * evolve by trade, applies the chosen evolutions and offers the download.
 * The file never leaves the browser.
 */
export function EditorIsland({ names }: { names: NameTables }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "list" });
  const [picked, setPicked] = useState<string[]>([]);

  const candidates = useMemo(() => loaded?.opened.candidates ?? [], [loaded]);
  const ready = useMemo(() => candidates.filter((c) => c.preview), [candidates]);

  // Release the download URL when it is no longer needed.
  const url = phase.name === "evolved" ? phase.url : null;
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const reset = () => {
    setLoaded(null);
    setError(null);
    setPicked([]);
    setPhase({ name: "list" });
  };

  const onFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setLoaded({ opened: openSave(bytes), fileName: file.name });
      setPicked([]);
      setPhase({ name: "list" });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Karrablast and Shelmet evolve only together: tapping one taps its partner too.
  const toggle = (key: string) => {
    const partnerRef = candidates.find((c) => c.key === key)?.preview?.partner;
    const keys = partnerRef ? [key, slotKey(partnerRef)] : [key];
    setPicked((p) => (p.includes(key) ? p.filter((k) => !keys.includes(k)) : [...new Set([...p, ...keys])]));
  };
  const allPicked = ready.length > 0 && picked.length === ready.length;

  const runEvolutions = () => {
    if (!loaded) return;
    // Evolve in list order, whatever order they were tapped in.
    const refs = ready.filter((c) => picked.includes(c.key)).map((c) => c.entry.ref);
    const result = loaded.opened.evolve(refs);
    if (!result.ok) {
      setPhase({ name: "verifyFailed", problems: result.problems });
      return;
    }
    const blobUrl = URL.createObjectURL(
      new Blob([result.bytes as BlobPart], { type: "application/octet-stream" }),
    );
    setPhase({
      name: "evolved",
      previews: result.previews,
      url: blobUrl,
      fileName: evolvedFileName(loaded.fileName),
    });
  };

  if (!loaded) {
    return (
      <div className={styles.island}>
        {error ? (
          <Card
            className={`${styles.notice} ${styles.noticeError} ${styles.errorBox}`}
            role="alert"
            data-testid="load-error"
          >
            <h2>{t.editor.errors.title}</h2>
            <p>{error.message}</p>
            {error.detail ? (
              <details className={styles.details}>
                <summary>{t.editor.errors.details}</summary>
                {error.detail}
              </details>
            ) : null}
          </Card>
        ) : null}
        <Dropzone onFile={onFile} busy={busy} />
      </div>
    );
  }

  const { save, check } = loaded.opened;

  if (phase.name === "evolved") {
    const steps = phase.previews.map((p) => ({
      from: p.from,
      to: p.to,
      fromName: p.nickname || speciesLabel(names, p.from),
      toName: speciesLabel(names, p.to),
    }));
    const d = t.editor.download;
    return (
      <div className={styles.island}>
        <EvolutionAnimation
          steps={steps}
          footer={
            <>
              <a
                className={buttonClassName("primary", "lg")}
                href={phase.url}
                download={phase.fileName}
                data-testid="download-link"
              >
                {d.button}
              </a>
              <Button variant="secondary" size="lg" onClick={reset}>
                {d.restart}
              </Button>
              <p className={styles.downloadHint} data-testid="download">
                {d.title(phase.previews.length)} · {d.hint}
              </p>
            </>
          }
        />
      </div>
    );
  }

  const saveBar = (
    <div className={styles.saveBar}>
      <p>
        <strong data-testid="trainer-name">{save.trainerName}</strong>
        <span data-testid="game-name">
          {GAME_NAMES[save.game]} · {loaded.fileName}
        </span>
      </p>
      <Button variant="secondary" onClick={reset}>
        {t.editor.save.change}
      </Button>
    </div>
  );

  if (phase.name === "verifyFailed") {
    return (
      <div className={styles.island}>
        {saveBar}
        <Card className={`${styles.notice} ${styles.noticeError}`} role="alert" data-testid="verify-failed">
          <p>{t.editor.evolve.verifyFailed}</p>
          <details className={styles.details}>
            <summary>{t.editor.errors.details}</summary>
            <ul>
              {phase.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </details>
          <Button variant="secondary" onClick={() => setPhase({ name: "list" })}>
            {t.editor.evolve.back}
          </Button>
        </Card>
      </div>
    );
  }

  const l = t.editor.list;
  const place = (e: PokemonEntry) =>
    e.ref.area === "party" ? l.party : save.boxes[e.ref.box]?.name || l.box(e.ref.box + 1);

  return (
    <div className={styles.island}>
      {saveBar}
      {!check.partyCheckPassed ? (
        <p className={`${styles.notice} ${styles.noticeWarn}`} role="status">
          {t.editor.save.partyCheckFailed}
        </p>
      ) : null}
      {save.unreadable.length > 0 ? (
        <p className={`${styles.notice} ${styles.noticeWarn}`} role="status">
          {t.editor.save.unreadable(save.unreadable.length)}
        </p>
      ) : null}

      {candidates.length === 0 ? (
        <Card className={styles.empty} data-testid="no-candidates">
          {/* Snorlax, taking it easy: nothing to do here. */}
          <Image src={spriteUrl(143)} alt="" width={120} height={120} sizes="120px" />
          <h2>{l.noneTitle}</h2>
          <p>{l.noneText}</p>
        </Card>
      ) : (
        <>
          <div className={styles.toolbar}>
            <span className={styles.counter} data-testid="evolvable-count">
              {l.evolvableCount(ready.length)}
            </span>
            {ready.length > 1 ? (
              <Button
                variant="ghost"
                onClick={() => setPicked(allPicked ? [] : ready.map((c) => c.key))}
                data-testid="select-all"
              >
                {allPicked ? l.selectNone : l.selectAll}
              </Button>
            ) : null}
          </div>
          <ul className={styles.tiles}>
            {candidates.map(({ key, entry, status, preview }) => {
              const { info } = entry;
              const target =
                preview?.to ?? (status.kind === "blocked" ? status.rules[0]!.to : status.rule.to);
              const from = speciesLabel(names, info.species);
              const to = speciesLabel(names, target);
              const on = picked.includes(key);
              const body = (
                <>
                  {preview ? (
                    <span className={styles.tileBadge} aria-hidden="true">
                      ⇄
                    </span>
                  ) : null}
                  <span className={styles.tileArt} aria-hidden="true">
                    <Image src={spriteUrl(info.species)} alt="" width={72} height={72} sizes="72px" />
                    <span className={styles.tileArrow}>→</span>
                    <Image src={spriteUrl(target)} alt="" width={72} height={72} sizes="72px" />
                  </span>
                  <span className={styles.tileName}>
                    {info.isNicknamed ? info.nickname : from}
                    <span className={styles.tileTo}> → {to}</span>
                  </span>
                  <span className={styles.tileMeta}>
                    {place(entry)} · {l.level} {entry.level}
                  </span>
                  {status.kind === "blocked" ? (
                    <span className={styles.tileReason} data-testid="block-reason">
                      {reasonText(status, names)}
                    </span>
                  ) : preview?.consumedItem ? (
                    <span className={styles.tileNote}>
                      {l.consumes(itemLabel(names, preview.consumedItem))}
                    </span>
                  ) : preview?.partner ? (
                    <span className={styles.tileNote}>{l.pairedNote}</span>
                  ) : null}
                </>
              );
              return (
                <li key={key}>
                  {preview ? (
                    <button
                      type="button"
                      className={`${styles.tile} ${on ? styles.tileOn : ""}`}
                      aria-pressed={on}
                      onClick={() => toggle(key)}
                      data-testid={`slot-${key}`}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={`${styles.tile} ${styles.tileBlocked}`} data-testid={`slot-${key}`}>
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className={styles.stickyBar}>
            <p>{picked.length ? l.selected(picked.length) : t.editor.evolve.hint}</p>
            <Button
              size="lg"
              onClick={runEvolutions}
              disabled={picked.length === 0}
              data-testid="evolve-button"
            >
              {t.editor.evolve.button(picked.length)}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
