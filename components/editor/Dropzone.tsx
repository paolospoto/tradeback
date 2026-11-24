"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";
import styles from "./editor.module.css";

/** File picker with drag and drop. The file is only read locally. */
export function Dropzone({ onFile, busy }: { onFile: (file: File) => void; busy: boolean }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const txt = t.editor.upload;

  return (
    <div
      className={`${styles.dropzone} ${over ? styles.dropzoneActive : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <span className={styles.dropIcon} aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 15V4" />
          <path d="M7.5 8.5L12 4l4.5 4.5" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
      </span>
      <label htmlFor={inputId} className={styles.dropTitle}>
        {busy ? txt.reading : txt.drop}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className={styles.fileInput}
        type="file"
        accept=".sav,.dsv,application/octet-stream"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
        data-testid="save-input"
      />
      <Button size="lg" onClick={() => inputRef.current?.click()} disabled={busy}>
        {txt.choose}
      </Button>
      <p className={styles.hint}>{txt.hint}</p>
    </div>
  );
}
