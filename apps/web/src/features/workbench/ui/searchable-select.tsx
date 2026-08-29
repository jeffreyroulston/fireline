"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils/cn";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Extra text matched by search (e.g. card id, short name). */
  keywords?: string;
};

function optionMatches(option: SearchableSelectOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = `${option.label} ${option.keywords ?? ""} ${option.value}`.toLowerCase();
  return haystack.includes(needle);
}

export function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Search…",
  emptyLabel = "No options",
  loadingLabel = "Loading…",
  noMatchLabel = "No matches",
  loading = false,
  disabled,
  clearable = false,
  clearLabel = "None",
  className,
}: {
  label: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  loadingLabel?: string;
  noMatchLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  /** When true, an empty-value row is offered at the top of the list. */
  clearable?: boolean;
  clearLabel?: string;
  className?: string;
}) {
  const listId = useId();
  const inputId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const isDisabled = disabled ?? (loading || (!clearable && options.length === 0));
  const selected = options.find((option) => option.value === value);
  const selectedLabel =
    value === "" && clearable
      ? clearLabel
      : (selected?.label ?? (loading ? loadingLabel : emptyLabel));

  const filtered = options.filter((option) => optionMatches(option, query));
  const rows: SearchableSelectOption[] =
    clearable && !query.trim()
      ? [{ value: "", label: clearLabel }, ...filtered]
      : filtered;
  const activeHighlight =
    rows.length === 0 ? 0 : Math.min(highlight, rows.length - 1);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [open, activeHighlight]);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  function rowsForQuery(nextQuery: string): SearchableSelectOption[] {
    const nextFiltered = options.filter((option) =>
      optionMatches(option, nextQuery),
    );
    return clearable && !nextQuery.trim()
      ? [{ value: "", label: clearLabel }, ...nextFiltered]
      : nextFiltered;
  }

  function openList() {
    if (isDisabled) return;
    const nextRows = rowsForQuery("");
    const selectedIndex = nextRows.findIndex((option) => option.value === value);
    setQuery("");
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (isDisabled) return;

    if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openList();
      return;
    }

    if (!open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (rows.length === 0) return;
      setHighlight((index) => (Math.min(index, rows.length - 1) + 1) % rows.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length === 0) return;
      setHighlight(
        (index) =>
          (Math.min(index, rows.length - 1) - 1 + rows.length) % rows.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const choice = rows[activeHighlight];
      if (choice) commit(choice.value);
    }
  }

  const showEmptyMessage = !loading && options.length === 0;
  const showNoMatch = open && !showEmptyMessage && rows.length === 0;

  return (
    <div ref={rootRef} className={cn("relative min-w-[180px] flex-1", className)}>
      <label className="min-w-0" htmlFor={inputId}>
        {label}
        <span className="relative block">
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && rows[activeHighlight]
                ? `${listId}-opt-${activeHighlight}`
                : undefined
            }
            autoComplete="off"
            disabled={isDisabled}
            placeholder={open ? placeholder : undefined}
            value={open ? query : selectedLabel}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              setHighlight(0);
              if (!open) setOpen(true);
            }}
            onFocus={openList}
            onClick={openList}
            onKeyDown={onKeyDown}
            className="pr-8"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-muted"
          >
            ▾
          </span>
        </span>
      </label>

      {open && !isDisabled && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-40 mt-1 max-h-60 overflow-auto border border-border bg-surface py-1 shadow-[0_10px_28px_rgba(16,42,48,0.14)]"
        >
          {loading && (
            <li className="px-3 py-2 font-mono text-[10px] tracking-[0.05em] text-muted uppercase">
              {loadingLabel}
            </li>
          )}
          {showEmptyMessage && (
            <li className="px-3 py-2 font-mono text-[10px] tracking-[0.05em] text-muted uppercase">
              {emptyLabel}
            </li>
          )}
          {showNoMatch && (
            <li className="px-3 py-2 font-mono text-[10px] tracking-[0.05em] text-muted uppercase">
              {noMatchLabel}
            </li>
          )}
          {!showEmptyMessage &&
            rows.map((option, index) => {
              const active = index === activeHighlight;
              const selectedOption = option.value === value;
              return (
                <li
                  key={`${option.value || "__clear"}-${option.label}`}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={selectedOption}
                  data-active={active ? "true" : undefined}
                  className={cn(
                    "cursor-pointer px-3 py-2 font-mono text-[10px] tracking-[0.05em] text-foreground uppercase",
                    active && "bg-surface-muted",
                    selectedOption && "text-primary-dark",
                  )}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(option.value);
                  }}
                >
                  {option.label}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
