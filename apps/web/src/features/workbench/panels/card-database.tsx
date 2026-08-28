"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cardImageUrl } from "@/lib/card-images";
import type { CardId, SimType } from "@/lib/engine";
import {
  fetchCardDatabase,
  fetchCardDatabaseCardDecks,
  fetchCardDatabasePairings,
  fetchCardDatabasePlayMatrix,
  fetchVersionGroups,
  type CardDatabaseCard,
  type CardDatabaseContributor,
  type CardDatabasePairingRow,
  type CardDatabasePairingsResponse,
  type CardDatabasePerformance,
  type CardPlayMatrixResponse,
  type VersionGroup,
  type WorkerVersion,
} from "@/lib/api/client";
import { InfoPopover } from "@/components/info-popover";
import {
  DataTable,
  PanelTopline,
  SectionHeading,
  sortDataTableRows,
  type DataTableColumn,
  type DataTableSort,
} from "../ui";
import { PHASE_LABELS, SIM_TYPE_LABELS } from "../types";
import type { TapePhase } from "@ga-fire/contracts";
import { cardsQueryPatch, parseKindParam, parseSimParam } from "../routes";
import { useWorkbenchQuery } from "../use-workbench-query";

const KIND_FILTERS = ["ally", "attack", "action", "item"] as const;

function groupKey(group: VersionGroup): string {
  return `${group.rulesVersion}:${group.samplerVersion}:${group.attributionVersion}`;
}

function formatGroup(group: VersionGroup): string {
  return `r${group.rulesVersion} · s${group.samplerVersion} · a${group.attributionVersion ?? "?"}`;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function formatDmg(value: number): string {
  return value.toFixed(1);
}

function formatSigned(value: number, digits = 0): string {
  const abs = Math.abs(value).toFixed(digits);
  if (value > 0) {
    return `+${abs}`;
  }
  if (value < 0) {
    return `−${abs}`;
  }
  return digits === 0 ? "0" : (0).toFixed(digits);
}

function formatLift(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  const text = abs.toFixed(1);
  return value > 0 ? `+${text}` : `−${text}`;
}

function deltaTone(value: number): "is-hotter" | "is-cooler" | "" {
  if (value > 0) return "is-hotter";
  if (value < 0) return "is-cooler";
  return "";
}

type PartnerMode = "pairs_with_me" | "depends_on_me";

const PARTNER_MODES: Array<{ id: PartnerMode; label: string }> = [
  { id: "pairs_with_me", label: "Pairs with me" },
  { id: "depends_on_me", label: "Who depends on me" },
];

function partnerDelta(row: CardDatabasePairingRow, mode: PartnerMode): number {
  return mode === "pairs_with_me"
    ? row.pairsWithMeDelta
    : row.dependsOnMeDelta;
}

function CardPartnersSection({
  pairings,
  selectedName,
  mode,
  onModeChange,
  sort,
  onSortChange,
}: {
  pairings: CardDatabasePairingsResponse | null;
  selectedName: string;
  mode: PartnerMode;
  onModeChange: (mode: PartnerMode) => void;
  sort: DataTableSort;
  onSortChange: (sort: DataTableSort) => void;
}) {
  if (!pairings || pairings.totalSamples === 0) {
    return (
      <p className="card-db-empty">No evaluate samples for this version.</p>
    );
  }

  if (pairings.partners.length === 0) {
    return (
      <p className="card-db-empty">
        No partners with enough opening-hand samples for mean comparison.
      </p>
    );
  }

  const columns: Array<DataTableColumn<CardDatabasePairingRow>> = [
    {
      id: "partner",
      header: "Card",
      sortable: true,
      sortValue: (row) => row.name,
      cell: (row) => row.name,
    },
    {
      id: "delta",
      header: mode === "pairs_with_me" ? "Lift" : "Depends",
      metric: true,
      sortable: true,
      sortValue: (row) => partnerDelta(row, mode),
      cell: (row) => {
        const delta = partnerDelta(row, mode);
        return (
          <span className={`card-db-partner-delta ${deltaTone(delta)}`}>
            {formatLift(delta)}
          </span>
        );
      },
    },
    {
      id: "bothMean",
      header: "Both",
      metric: true,
      sortable: true,
      sortValue: (row) => row.bothMean,
      cell: (row) => formatDmg(row.bothMean),
    },
    {
      id: "selectedWithoutPartner",
      header: `${selectedName} alone`,
      metric: true,
      sortable: true,
      sortValue: (row) => row.selectedWithoutPartnerMean,
      cell: (row) => formatDmg(row.selectedWithoutPartnerMean),
    },
    {
      id: "partnerWithoutSelected",
      header: "Partner alone",
      metric: true,
      sortable: true,
      sortValue: (row) => row.partnerWithoutSelectedMean,
      cell: (row) => formatDmg(row.partnerWithoutSelectedMean),
    },
    {
      id: "samples",
      header: "Samples",
      headerHelp: (
        <InfoPopover hideLabel label="Samples">
          Opening-hand sample counts for each mean: both cards / {selectedName} without
          partner / partner without {selectedName}.
        </InfoPopover>
      ),
      metric: true,
      sortable: true,
      sortValue: (row) => row.bothCount,
      cell: (row) =>
        `${row.bothCount} / ${row.selectedWithoutPartnerCount} / ${row.partnerWithoutSelectedCount}`,
    },
  ];

  const rows = sortDataTableRows(pairings.partners, columns, sort);

  return (
    <div className="card-db-partners">
      <div
        className="card-db-partner-modes"
        role="tablist"
        aria-label="Partner analysis mode"
      >
        {PARTNER_MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={mode === entry.id}
            className={mode === entry.id ? "is-active" : undefined}
            onClick={() => onModeChange(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.cardId}
        sort={sort}
        onSortChange={onSortChange}
      />
    </div>
  );
}

function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase as TapePhase] ?? phase;
}

const PHASE_ORDER = Object.keys(PHASE_LABELS) as TapePhase[];

function phaseRank(phase: string): number {
  const index = PHASE_ORDER.indexOf(phase as TapePhase);
  return index === -1 ? PHASE_ORDER.length : index;
}

function PlayTimingList({ matrix }: { matrix: CardPlayMatrixResponse }) {
  if (matrix.totalPlays === 0 || matrix.cells.length === 0) {
    return (
      <p className="card-db-empty">
        No play events in stored sample lines for this version.
      </p>
    );
  }

  const rows = [...matrix.cells].sort((a, b) => {
    if (a.turn !== b.turn) return a.turn - b.turn;
    return phaseRank(a.phase) - phaseRank(b.phase);
  });

  const columns: Array<DataTableColumn<(typeof rows)[number]>> = [
    { id: "turn", header: "Turn", cell: (row) => row.turn },
    {
      id: "phase",
      header: "Phase",
      cell: (row) => phaseLabel(row.phase),
    },
    {
      id: "share",
      header: "Share",
      metric: true,
      cell: (row) => formatPct(row.shareOfPlays),
    },
    {
      id: "plays",
      header: "Plays",
      metric: true,
      cell: (row) => row.plays.toLocaleString(),
    },
    {
      id: "perSample",
      header: "Per sample",
      metric: true,
      cell: (row) => row.perSample.toFixed(2),
    },
  ];

  return (
    <div className="card-db-play-wrap">
      <p className="card-db-play-meta">
        {matrix.totalPlays.toLocaleString()} plays across{" "}
        {matrix.totalSamples.toLocaleString()} samples
      </p>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => `${row.turn}:${row.phase}`}
      />
    </div>
  );
}

function cardTraitLines(card: CardDatabaseCard): string[] {
  const traits: string[] = [];
  if (card.unique) traits.push("Unique");
  if (card.stealth) traits.push("Stealth");
  if (card.floatingMemory) traits.push("Floating Memory");
  if (card.assassinPowerBonus) {
    traits.push(`Assassin +${card.assassinPowerBonus} power`);
  }
  if (card.assassinStealth) traits.push("Assassin Stealth");
  if (card.automaton) traits.push("Automaton");
  if (card.fast) traits.push("Fast");
  if (card.kindle) traits.push(`Kindle ${card.kindle}`);
  if (card.prepare) traits.push(`Prepare ${card.prepare}`);
  return traits;
}

function formatKindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function CardDbHeroStats({ card }: { card: CardDatabaseCard }) {
  const traits = cardTraitLines(card);
  const elementClass =
    card.element === "fire" ? "is-element-fire" : `is-element-${card.element}`;

  return (
    <div className="card-db-hero-stats">
      <div className="card-db-hero-stat-row">
        <span className="card-db-hero-badge">
          <span className="card-db-hero-badge-label">Cost</span>
          {card.cost}
        </span>
        <span className="card-db-hero-badge">
          <span className="card-db-hero-badge-label">Kind</span>
          {formatKindLabel(card.kind)}
        </span>
        <span className={["card-db-hero-badge", elementClass].join(" ")}>
          <span className="card-db-hero-badge-label">Element</span>
          {card.element}
        </span>
      </div>
      {card.power != null && card.life != null ? (
        <dl className="card-db-hero-combat">
          <div>
            <dt>Power</dt>
            <dd>{card.power}</dd>
          </div>
          <div>
            <dt>Life</dt>
            <dd>{card.life}</dd>
          </div>
        </dl>
      ) : null}
      {traits.length > 0 ? (
        <ul className="card-db-hero-traits">
          {traits.map((trait) => (
            <li key={trait} className="card-db-hero-trait">{trait}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CardDbCardThumb({
  cardId,
  name,
  element,
  cost,
  kind,
  className,
}: {
  cardId: string;
  name: string;
  element?: string;
  cost?: number;
  kind?: string;
  className?: string;
}) {
  const src = cardImageUrl(cardId as CardId);
  const classes = ["card-db-card-thumb", className].filter(Boolean).join(" ");

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={classes} src={src} alt="" />
    );
  }

  return (
    <div
      className={`card-tile deck-card-fallback${element === "fire" ? " is-fire" : ""} ${classes}`}
    >
      <span>{element ?? "card"}</span>
      <b>{name}</b>
      {cost != null && kind ? (
        <small>
          {cost} · {kind}
        </small>
      ) : null}
    </div>
  );
}

function CardDbPartnerPeek({
  pairings,
  catalogCards,
  onSelectPartner,
}: {
  pairings: CardDatabasePairingsResponse | null;
  catalogCards: CardDatabaseCard[];
  onSelectPartner: (cardId: string) => void;
}) {
  const topPartners = pairings
    ? [...pairings.partners]
        .sort((left, right) => right.pairsWithMeDelta - left.pairsWithMeDelta)
        .slice(0, 3)
    : [];

  return (
    <div className="card-db-partner-peek">
      <p className="card-db-partner-peek-label">Top partners</p>
      {topPartners.length === 0 ? (
        <p className="card-db-partner-peek-empty">
          {pairings
            ? "No partners with enough samples for comparison."
            : "Loading partners…"}
        </p>
      ) : (
        <ul className="card-db-partner-peek-grid">
          {topPartners.map((partner) => {
            const catalogCard = catalogCards.find(
              (card) => card.id === partner.cardId,
            );
            return (
              <li key={partner.cardId}>
                <button
                  type="button"
                  className="card-db-partner-peek-tile"
                  onClick={() => onSelectPartner(partner.cardId)}
                >
                  <CardDbCardThumb
                    cardId={partner.cardId}
                    name={partner.name}
                    element={catalogCard?.element}
                    cost={catalogCard?.cost}
                    kind={catalogCard?.kind}
                  />
                  <span className="card-db-partner-peek-name">{partner.name}</span>
                  <span
                    className={`card-db-partner-delta ${deltaTone(partner.pairsWithMeDelta)}`}
                  >
                    {formatLift(partner.pairsWithMeDelta)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CardDbDetailPanel({
  title,
  titleHelp,
  children,
  className,
}: {
  title?: string;
  titleHelp?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["card-db-detail-panel", className].filter(Boolean).join(" ")}
    >
      {title ? (
        <SectionHeading
          title={
            titleHelp ? (
              <span className="section-heading-with-help">
                {title}
                <InfoPopover hideLabel label={title}>
                  {titleHelp}
                </InfoPopover>
              </span>
            ) : (
              title
            )
          }
        />
      ) : null}
      {children}
    </div>
  );
}

function PerformanceBlock({
  performance,
}: {
  performance: CardDatabasePerformance | null;
}) {
  if (!performance) {
    return <p className="card-db-empty">No performance data for this version.</p>;
  }
  return (
    <>
      {performance.handLift != null ? (
        <dl className="card-db-stats card-db-stats-hand">
          <div>
            <dt>In opening hand</dt>
            <dd>{formatDmg(performance.withHandMean ?? 0)}</dd>
          </div>
          <div>
            <dt>Not in opening hand</dt>
            <dd>{formatDmg(performance.withoutHandMean ?? 0)}</dd>
          </div>
          <div>
            <dt>Lift</dt>
            <dd>
              <span className={`card-db-partner-delta ${deltaTone(performance.handLift)}`}>
                {formatLift(performance.handLift)}
              </span>
            </dd>
          </div>
          <div>
            <dt>
              <InfoPopover label="Samples">
                Opening-hand samples with this card in hand / without.
              </InfoPopover>
            </dt>
            <dd>
              {performance.withHandSamples.toLocaleString()} /{" "}
              {performance.withoutHandSamples.toLocaleString()}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="card-db-empty">
          Not enough opening-hand samples for with/without comparison (need at
          least 5 in each bucket).
        </p>
      )}
      <dl className="card-db-stats">
        <div>
          <dt>See %</dt>
          <dd>{formatPct(performance.seeRate)}</dd>
        </div>
        <div>
          <dt>Open %</dt>
          <dd>{formatPct(performance.openRate)}</dd>
        </div>
        <div>
          <dt>Play|hand %</dt>
          <dd>{formatPct(performance.playWhenInHand)}</dd>
        </div>
        <div>
          <dt>Dmg|seen</dt>
          <dd>{formatDmg(performance.damageWhenSeen)}</dd>
        </div>
        <div>
          <dt>Plays</dt>
          <dd>{performance.plays.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Damage</dt>
          <dd>{performance.damage.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Runs</dt>
          <dd>{performance.runCount}</dd>
        </div>
        <div>
          <dt>Decks</dt>
          <dd>{performance.deckCount}</dd>
        </div>
        <div>
          <dt>Samples</dt>
          <dd>{performance.eligibleSamples.toLocaleString()}</dd>
        </div>
      </dl>
    </>
  );
}

function CatalogTile({
  card,
  onSelect,
}: {
  card: CardDatabaseCard;
  onSelect: () => void;
}) {
  const src = cardImageUrl(card.id as CardId);
  const hasStats = card.performance != null;
  return (
    <button
      type="button"
      className={`card-db-tile${hasStats ? "" : " is-empty"}`}
      onClick={onSelect}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" />
      ) : (
        <div
          className={`card-tile deck-card-fallback${card.element === "fire" ? " is-fire" : ""}`}
        >
          <span>{card.element}</span>
          <b>{card.name}</b>
          <small>
            {card.cost} · {card.kind}
          </small>
        </div>
      )}
      <span className="card-db-tile-name">{card.name}</span>
      {hasStats ? (
        card.performance!.handLift != null ? (
          <span
            className={`card-db-chip card-db-partner-delta ${deltaTone(card.performance!.handLift)}`}
          >
            Lift {formatLift(card.performance!.handLift)}
          </span>
        ) : (
          <span className="card-db-chip is-muted">No lift</span>
        )
      ) : (
        <span className="card-db-chip is-muted">No data</span>
      )}
      {!hasStats && card.hasOlderData && (
        <span className="card-db-older">Older data</span>
      )}
    </button>
  );
}

export function CardDatabasePanel({
  workerVersion,
}: {
  workerVersion: WorkerVersion | null;
}) {
  const router = useRouter();
  const { searchParams, replaceQuery, pushQuery } = useWorkbenchQuery("cards");
  const [simType, setSimType] = useState<SimType>(
    () => parseSimParam(searchParams.get("sim")) ?? "fire_brick",
  );
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string | null>(() =>
    parseKindParam(searchParams.get("kind")),
  );
  const [contributors, setContributors] = useState<CardDatabaseContributor[]>(
    [],
  );
  const [cards, setCards] = useState<CardDatabaseCard[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [totalSamples, setTotalSamples] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    searchParams.get("card"),
  );
  const [versionGroups, setVersionGroups] = useState<VersionGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [detailGroupKey, setDetailGroupKey] = useState("");
  const [detailPerformance, setDetailPerformance] =
    useState<CardDatabasePerformance | null>(null);
  const [detailDecks, setDetailDecks] = useState<
    Array<{
      deckId: string;
      name: string;
      copies: number | null;
      runCount: number;
      samples: number;
      damageWhenSeen: number | null;
      withHandMean: number | null;
      withoutHandMean: number | null;
      handLift: number | null;
      withHandSamples: number;
      withoutHandSamples: number;
    }>
  >([]);
  const [detailPlayMatrix, setDetailPlayMatrix] =
    useState<CardPlayMatrixResponse | null>(null);
  const [detailPairings, setDetailPairings] =
    useState<CardDatabasePairingsResponse | null>(null);
  const [partnerMode, setPartnerMode] = useState<PartnerMode>("pairs_with_me");
  const [partnerSort, setPartnerSort] = useState<DataTableSort>({
    columnId: "delta",
    direction: "desc",
  });
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    setSimType(parseSimParam(searchParams.get("sim")) ?? "fire_brick");
    setKindFilter(parseKindParam(searchParams.get("kind")));
    setSelectedId(searchParams.get("card"));
  }, [searchParams]);

  function selectCard(cardId: string | null) {
    if (cardId) {
      setSelectedId(cardId);
      pushQuery((current) => cardsQueryPatch(current, { card: cardId }));
      return;
    }
    router.back();
  }

  function updateSimType(value: SimType, clearSelection = false) {
    setSimType(value);
    if (clearSelection) {
      setSelectedId(null);
    }
    replaceQuery((current) =>
      cardsQueryPatch(current, {
        sim: value,
        deck: null,
        ...(clearSelection ? { card: null } : {}),
      }),
    );
  }

  function updateKindFilter(kind: string | null) {
    setKindFilter(kind);
    replaceQuery((current) => cardsQueryPatch(current, { kind }));
  }

  function updateDeckFilter(deckId: string | null) {
    replaceQuery((current) => cardsQueryPatch(current, { deck: deckId }));
  }

  const deckParam = searchParams.get("deck");
  const selectedDeckId = useMemo(() => {
    if (!deckParam) return null;
    if (contributors.length === 0) return deckParam;
    return contributors.some((entry) => entry.deckId === deckParam)
      ? deckParam
      : null;
  }, [deckParam, contributors]);

  const currentEngine = useMemo(() => {
    if (workerVersion) {
      return {
        rulesVersion: workerVersion.rules,
        samplerVersion: workerVersion.sampler,
        attributionVersion: workerVersion.attribution,
      };
    }
    const latest = versionGroups[0];
    if (!latest) return null;
    return {
      rulesVersion: latest.rulesVersion,
      samplerVersion: latest.samplerVersion,
      attributionVersion: latest.attributionVersion ?? 0,
    };
  }, [workerVersion, versionGroups]);

  const includedDeckIds = useMemo(() => {
    if (!selectedDeckId) return undefined;
    return [selectedDeckId];
  }, [selectedDeckId]);

  const deckFilterKey = selectedDeckId ?? "all";

  const selectedCard = useMemo(
    () => cards.find((card) => card.id === selectedId) ?? null,
    [cards, selectedId],
  );

  const { mainCards, materialCards } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (card: CardDatabaseCard) => {
      if (q) {
        const hay = `${card.name} ${card.short} ${card.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (card.kind === "material") return true;
      if (kindFilter && card.kind !== kindFilter) return false;
      return true;
    };
    const filtered = cards.filter(match);
    return {
      mainCards: filtered.filter(
        (card) => card.kind !== "material" && card.kind !== "brick" && card.id !== "brick",
      ),
      materialCards: filtered.filter((card) => card.kind === "material"),
    };
  }, [cards, search, kindFilter]);

  const ownershipSummary = useMemo(() => {
    if (contributors.length === 0) return "No evaluate runs for this sim yet.";
    if (selectedDeckId) {
      const deck = contributors.find((entry) => entry.deckId === selectedDeckId);
      if (deck) {
        return `${deck.name} · ${deck.runCount} run${
          deck.runCount === 1 ? "" : "s"
        } · ${deck.samples.toLocaleString()} samples`;
      }
    }
    const samples = contributors.reduce((sum, entry) => sum + entry.samples, 0);
    const top = contributors[0];
    const topPct = top && samples > 0 ? formatPct(top.samples / samples) : null;
    const parts = [
      `${contributors.length} deck${contributors.length === 1 ? "" : "s"}`,
      `${samples.toLocaleString()} samples`,
    ];
    if (top && topPct) {
      parts.push(`${top.name} ${topPct}`);
    }
    return parts.join(" · ");
  }, [contributors, selectedDeckId]);

  useEffect(() => {
    let cancelled = false;
    setGroupsLoading(true);
    void (async () => {
      try {
        const groups = await fetchVersionGroups({
          simType,
          kind: "evaluate",
        });
        if (cancelled) return;
        setVersionGroups(groups);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load version groups.",
          );
        }
      } finally {
        if (!cancelled) setGroupsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [simType]);

  useEffect(() => {
    if (!currentEngine) return;
    const currentKey = `${currentEngine.rulesVersion}:${currentEngine.samplerVersion}:${currentEngine.attributionVersion}`;
    setDetailGroupKey((prev) => {
      if (prev && versionGroups.some((g) => groupKey(g) === prev)) return prev;
      if (versionGroups.some((g) => groupKey(g) === currentKey)) return currentKey;
      return versionGroups[0] ? groupKey(versionGroups[0]) : currentKey;
    });
  }, [currentEngine, versionGroups]);

  useEffect(() => {
    if (!currentEngine) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const result = await fetchCardDatabase({
          simType,
          rulesVersion: currentEngine.rulesVersion,
          samplerVersion: currentEngine.samplerVersion,
          attributionVersion: currentEngine.attributionVersion,
          currentRulesVersion: currentEngine.rulesVersion,
          currentSamplerVersion: currentEngine.samplerVersion,
          currentAttributionVersion: currentEngine.attributionVersion,
          deckIds: includedDeckIds,
        });
        if (cancelled) return;
        setContributors(result.contributors);
        setCards(result.cards);
        setTotalRuns(result.totalRuns);
        setTotalSamples(result.totalSamples);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load card database.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [simType, currentEngine, deckFilterKey]);

  useEffect(() => {
    if (!selectedCard || !currentEngine || !detailGroupKey) {
      setDetailPerformance(null);
      setDetailDecks([]);
      setDetailPlayMatrix(null);
      setDetailPairings(null);
      setDetailError("");
      return;
    }
    const group =
      versionGroups.find((g) => groupKey(g) === detailGroupKey) ?? null;
    const version = group
      ? {
          rulesVersion: group.rulesVersion,
          samplerVersion: group.samplerVersion,
          attributionVersion:
            group.attributionVersion ?? currentEngine.attributionVersion,
        }
      : currentEngine;

    const isCurrent =
      version.rulesVersion === currentEngine.rulesVersion &&
      version.samplerVersion === currentEngine.samplerVersion &&
      version.attributionVersion === currentEngine.attributionVersion;

    let cancelled = false;
    void (async () => {
      try {
        setDetailError("");
        if (isCurrent) {
          setDetailPerformance(selectedCard.performance);
        } else {
          const result = await fetchCardDatabase({
            simType,
            rulesVersion: version.rulesVersion,
            samplerVersion: version.samplerVersion,
            attributionVersion: version.attributionVersion,
            currentRulesVersion: currentEngine.rulesVersion,
            currentSamplerVersion: currentEngine.samplerVersion,
            currentAttributionVersion: currentEngine.attributionVersion,
            deckIds: includedDeckIds,
          });
          if (cancelled) return;
          const row = result.cards.find((c) => c.id === selectedCard.id);
          setDetailPerformance(row?.performance ?? null);
        }
        const [decks, playMatrix, pairings] = await Promise.all([
          fetchCardDatabaseCardDecks({
            cardId: selectedCard.id,
            simType,
            rulesVersion: version.rulesVersion,
            samplerVersion: version.samplerVersion,
            attributionVersion: version.attributionVersion,
            deckIds: includedDeckIds,
          }),
          fetchCardDatabasePlayMatrix({
            cardId: selectedCard.id,
            simType,
            rulesVersion: version.rulesVersion,
            samplerVersion: version.samplerVersion,
            attributionVersion: version.attributionVersion,
            deckIds: includedDeckIds,
          }),
          selectedCard.kind === "material"
            ? Promise.resolve({
                cardId: selectedCard.id,
                totalSamples: 0,
                partners: [],
              } satisfies CardDatabasePairingsResponse)
            : fetchCardDatabasePairings({
                cardId: selectedCard.id,
                simType,
                rulesVersion: version.rulesVersion,
                samplerVersion: version.samplerVersion,
                attributionVersion: version.attributionVersion,
                deckIds: includedDeckIds,
              }),
        ]);
        if (!cancelled) {
          setDetailDecks(decks.decks);
          setDetailPlayMatrix(playMatrix);
          setDetailPairings(pairings);
        }
      } catch (err) {
        if (!cancelled) {
          setDetailPerformance(null);
          setDetailDecks([]);
          setDetailPlayMatrix(null);
          setDetailPairings(null);
          setDetailError(
            err instanceof Error ? err.message : "Failed to load card detail.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedCard,
    detailGroupKey,
    versionGroups,
    currentEngine,
    simType,
    deckFilterKey,
    includedDeckIds,
  ]);

  useEffect(() => {
    setPartnerMode("pairs_with_me");
    setPartnerSort({ columnId: "delta", direction: "desc" });
  }, [selectedId, detailGroupKey, deckFilterKey]);

  function handlePartnerModeChange(mode: PartnerMode) {
    setPartnerMode(mode);
    setPartnerSort({ columnId: "delta", direction: "desc" });
  }

  function deckFilterSelect(
    value: string,
    disabled: boolean,
  ) {
    return (
      <label className="field">
        <span>Deck</span>
        <select
          value={value}
          disabled={disabled}
          onChange={(event) =>
            updateDeckFilter(event.target.value || null)
          }
        >
          <option value="">All decks</option>
          {contributors.map((deck) => (
            <option key={deck.deckId} value={deck.deckId}>
              {deck.name} · {deck.samples.toLocaleString()} samples
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="card-db">
      <PanelTopline kicker="CARD DATABASE">
        Browse catalog performance across saved-deck evaluations. Grid chips show
        opening-hand lift vs the same deck without the card; open a card for
        detail and older versions.
      </PanelTopline>

      {!selectedCard && (
        <div className="card-db-toolbar">
          <label className="field">
            <span>Simulation</span>
            <select
              value={simType}
              onChange={(event) => {
                updateSimType(event.target.value as SimType, true);
              }}
            >
              {(Object.keys(SIM_TYPE_LABELS) as SimType[]).map((id) => (
                <option key={id} value={id}>
                  {SIM_TYPE_LABELS[id]}
                </option>
              ))}
            </select>
          </label>
          {deckFilterSelect(selectedDeckId ?? "", contributors.length === 0)}
          <label className="field card-db-search">
            <span>Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, short, or id"
            />
          </label>
          <div className="card-db-kinds" role="group" aria-label="Kind filter">
            <button
              type="button"
              className={!kindFilter ? "active" : ""}
              onClick={() => updateKindFilter(null)}
            >
              All
            </button>
            {KIND_FILTERS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={kindFilter === kind ? "active" : ""}
                onClick={() =>
                  updateKindFilter(kindFilter === kind ? null : kind)
                }
              >
                {kind}
              </button>
            ))}
          </div>
        </div>
      )}

      {!selectedCard && (
        <details className="card-db-sources">
          <summary>
            Deck sources · {ownershipSummary}
            {totalRuns > 0
              ? ` · ${totalRuns} runs · ${totalSamples.toLocaleString()} samples`
              : ""}
          </summary>
          {contributors.length === 0 ? (
            <p className="card-db-empty">No contributing decks yet.</p>
          ) : (
            <ul className="card-db-contributor-list">
              {contributors.map((deck) => (
                <li key={deck.deckId}>
                  <span className="card-db-contributor-name">{deck.name}</span>
                  <span className="card-db-contributor-meta">
                    {deck.runCount} run{deck.runCount === 1 ? "" : "s"} ·{" "}
                    {deck.samples.toLocaleString()} samples ·{" "}
                    {formatPct(deck.sampleShare)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      {!currentEngine && groupsLoading && (
        <p className="card-db-empty">Loading version data…</p>
      )}
      {!currentEngine && !groupsLoading && (
        <p className="card-db-empty">
          No evaluate data for this simulation yet.
        </p>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {loading && !selectedCard && (
        <p className="card-db-empty">Loading performance…</p>
      )}

      {selectedCard ? (
        <section className="card-db-detail" aria-live="polite">
          <div className="card-db-detail-bar">
            <button
              type="button"
              className="secondary-action card-db-back"
              onClick={() => selectCard(null)}
            >
              ← Back to catalog
            </button>
            <div className="card-db-detail-filters">
              <label className="field">
                <span>Simulation</span>
                <select
                  value={simType}
                  onChange={(event) => {
                    updateSimType(event.target.value as SimType);
                  }}
                >
                  {(Object.keys(SIM_TYPE_LABELS) as SimType[]).map((id) => (
                    <option key={id} value={id}>
                      {SIM_TYPE_LABELS[id]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Version</span>
                <select
                  value={detailGroupKey}
                  onChange={(event) => setDetailGroupKey(event.target.value)}
                >
                  {currentEngine && (
                    <option
                      value={`${currentEngine.rulesVersion}:${currentEngine.samplerVersion}:${currentEngine.attributionVersion}`}
                    >
                      {workerVersion ? "Current engine" : "Latest data"} · r
                      {currentEngine.rulesVersion} · s
                      {currentEngine.samplerVersion} · a
                      {currentEngine.attributionVersion}
                    </option>
                  )}
                  {versionGroups
                    .filter((group) => {
                      if (!currentEngine) return true;
                      return (
                        groupKey(group) !==
                        `${currentEngine.rulesVersion}:${currentEngine.samplerVersion}:${currentEngine.attributionVersion}`
                      );
                    })
                    .map((group) => (
                      <option key={groupKey(group)} value={groupKey(group)}>
                        {formatGroup(group)}
                      </option>
                    ))}
                </select>
              </label>
              {deckFilterSelect(selectedDeckId ?? "", contributors.length === 0)}
            </div>
          </div>

          <CardDbDetailPanel className="card-db-detail-hero-panel">
            <div
              className={[
                "card-db-detail-hero",
                selectedCard.kind !== "material" ? "has-partner-peek" : undefined,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="card-db-detail-hero-info">
                <div className="card-db-detail-hero-art">
                  {cardImageUrl(selectedCard.id as CardId) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cardImageUrl(selectedCard.id as CardId)!}
                      alt={selectedCard.name}
                    />
                  ) : (
                    <div
                      className={`card-tile deck-card-fallback${selectedCard.element === "fire" ? " is-fire" : ""}`}
                    >
                      <span>{selectedCard.element}</span>
                      <b>{selectedCard.name}</b>
                      <small>
                        {selectedCard.cost} · {selectedCard.kind}
                      </small>
                    </div>
                  )}
                </div>
                <div className="card-db-detail-hero-body">
                  <h2>{selectedCard.name}</h2>
                  {selectedCard.short &&
                  selectedCard.short !== selectedCard.name ? (
                    <p className="card-db-hero-short">{selectedCard.short}</p>
                  ) : null}
                  <CardDbHeroStats card={selectedCard} />
                </div>
              </div>
              {selectedCard.kind !== "material" ? (
                <CardDbPartnerPeek
                  pairings={detailPairings}
                  catalogCards={cards}
                  onSelectPartner={selectCard}
                />
              ) : null}
            </div>
          </CardDbDetailPanel>

          <CardDbDetailPanel
            title="PERFORMANCE"
            titleHelp="Mean total line damage per opening hand (weighted by hand frequency)."
          >
            <PerformanceBlock performance={detailPerformance} />
          </CardDbDetailPanel>

          {selectedCard.kind !== "material" && (
            <CardDbDetailPanel
              title="CARD PARTNERS"
              titleHelp={
                <>
                  Mean opening-hand damage across{" "}
                  {detailPairings?.totalSamples.toLocaleString() ?? "—"} samples.
                </>
              }
            >
              <CardPartnersSection
                pairings={detailPairings}
                selectedName={selectedCard.name}
                mode={partnerMode}
                onModeChange={handlePartnerModeChange}
                sort={partnerSort}
                onSortChange={setPartnerSort}
              />
            </CardDbDetailPanel>
          )}

          <CardDbDetailPanel title="PLAY TIMING">
            {detailPlayMatrix ? (
              <PlayTimingList matrix={detailPlayMatrix} />
            ) : (
              <p className="card-db-empty">No play timing for this version.</p>
            )}
          </CardDbDetailPanel>

          <CardDbDetailPanel title="IN DECKS">
            {detailError && (
              <p className="error-banner" role="alert">
                {detailError}
              </p>
            )}
            {detailDecks.length === 0 ? (
              <p className="card-db-empty">
                {selectedCard.kind === "material"
                  ? "No evaluate stats for this material in included decks."
                  : "Not present in any saved deck."}
              </p>
            ) : (
              <DataTable
                columns={[
                  {
                    id: "deck",
                    header: "Deck",
                    cell: (deck) => deck.name,
                  },
                  {
                    id: "copies",
                    header: "Copies",
                    metric: true,
                    cell: (deck) => (deck.copies != null ? deck.copies : "—"),
                  },
                  {
                    id: "withHand",
                    header: "In hand",
                    metric: true,
                    cell: (deck) =>
                      deck.withHandMean != null
                        ? formatDmg(deck.withHandMean)
                        : "—",
                  },
                  {
                    id: "withoutHand",
                    header: "Not in hand",
                    metric: true,
                    cell: (deck) =>
                      deck.withoutHandMean != null
                        ? formatDmg(deck.withoutHandMean)
                        : "—",
                  },
                  {
                    id: "handLift",
                    header: "Lift",
                    metric: true,
                    cell: (deck) =>
                      deck.handLift != null ? (
                        <span
                          className={`card-db-partner-delta ${deltaTone(deck.handLift)}`}
                        >
                          {formatLift(deck.handLift)}
                        </span>
                      ) : (
                        "—"
                      ),
                  },
                  {
                    id: "samples",
                    header: "Samples",
                    headerHelp: (
                      <InfoPopover hideLabel label="Samples">
                        Opening-hand sample counts: with this card in hand / without.
                      </InfoPopover>
                    ),
                    metric: true,
                    cell: (deck) =>
                      deck.withHandSamples > 0 || deck.withoutHandSamples > 0
                        ? `${deck.withHandSamples} / ${deck.withoutHandSamples}`
                        : "—",
                  },
                ]}
                rows={detailDecks}
                rowKey={(deck) => deck.deckId}
              />
            )}
          </CardDbDetailPanel>
        </section>
      ) : (
        <div className="card-db-grid-pane">
          <SectionHeading
            title="CATALOG"
            meta={`${mainCards.length} cards`}
          />
          <div className="card-db-grid">
            {mainCards.map((card) => (
              <CatalogTile
                key={card.id}
                card={card}
                onSelect={() => selectCard(card.id)}
              />
            ))}
          </div>

          {materialCards.length > 0 && (
            <>
              <SectionHeading
                title="MATERIALS"
                meta={`${materialCards.length} cards`}
              />
              <div className="card-db-grid">
                {materialCards.map((card) => (
                  <CatalogTile
                    key={card.id}
                    card={card}
                    onSelect={() => selectCard(card.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
