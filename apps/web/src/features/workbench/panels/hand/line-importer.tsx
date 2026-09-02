"use client";

import { useId, useRef, useState } from "react";
import { CARD_LIST } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/lib/utils/variants";
import {
  parseLineTape,
  type ImportedLine,
} from "../../lib/import-line-tape";

export function LineImporter({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (line: ImportedLine) => void;
}) {
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyText(text: string) {
    const parsed = parseLineTape(text, CARD_LIST);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    onImport(parsed.line);
    setDraft("");
    setFileName(null);
    setError(null);
    onOpenChange(false);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="grid min-w-0 gap-3 border border-border bg-surface p-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <label
          htmlFor={fileId}
          className="font-mono text-[10px] tracking-[0.08em] text-muted uppercase"
        >
          Exported tape
        </label>
        <input
          ref={fileRef}
          id={fileId}
          type="file"
          accept=".txt,text/plain,application/json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            setFileName(file.name);
            void file.text().then((text) => {
              setDraft(text);
              setError(null);
            });
          }}
        />
        <button
          type="button"
          className={buttonVariants({ intent: "secondary", size: "compact" })}
          onClick={() => fileRef.current?.click()}
        >
          Choose file
        </button>
        {fileName && (
          <span className="font-mono text-[11px] text-muted">{fileName}</span>
        )}
      </div>
      <textarea
        aria-label="Line tape text"
        className="min-h-[140px] resize-y border border-border bg-surface-muted p-3 font-mono text-xs leading-[1.7] text-foreground"
        value={draft}
        placeholder={"OPTIMAL LINE\nDamage: 20\n\n00 | 1 Main | …"}
        spellCheck={false}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
      />
      {error && (
        <p className="m-0 text-sm text-primary-dark" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className={cn(buttonVariants({ intent: "secondary" }), "w-fit")}
        disabled={draft.trim().length === 0}
        onClick={() => applyText(draft)}
      >
        Load line
      </button>
    </div>
  );
}
