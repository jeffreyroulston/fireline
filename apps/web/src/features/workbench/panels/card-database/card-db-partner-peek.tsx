"use client";

import type {
  CardDatabaseCard,
  CardDatabasePairingsResponse,
} from "@/lib/api/client";
import { CardDbCardThumb } from "./card-db-card-thumb";
import { formatLift } from "./formatters";
import {
  cardDbPartnerPeekClass,
  cardDbPartnerPeekEmptyClass,
  cardDbPartnerPeekFallbackClass,
  cardDbPartnerPeekGridClass,
  cardDbPartnerPeekLabelClass,
  cardDbPartnerPeekNameClass,
  cardDbPartnerPeekThumbClass,
  cardDbPartnerPeekTileClass,
  partnerDeltaClass,
} from "./shared";

export interface CardDbPartnerPeekProps {
  readonly pairings: CardDatabasePairingsResponse | null;
  readonly catalogCards: CardDatabaseCard[];
  readonly onSelectPartner: (cardId: string) => void;
}

export function CardDbPartnerPeek({
  pairings,
  catalogCards,
  onSelectPartner,
}: CardDbPartnerPeekProps) {
  const topPartners = pairings
    ? [...pairings.partners]
        .sort((left, right) => right.pairsWithMeDelta - left.pairsWithMeDelta)
        .slice(0, 3)
    : [];

  return (
    <div className={cardDbPartnerPeekClass}>
      <p className={cardDbPartnerPeekLabelClass}>Top partners</p>
      {topPartners.length === 0 ? (
        <p className={cardDbPartnerPeekEmptyClass}>
          {pairings
            ? "No partners with enough samples for comparison."
            : "Loading partners…"}
        </p>
      ) : (
        <ul className={cardDbPartnerPeekGridClass}>
          {topPartners.map((partner) => {
            const catalogCard = catalogCards.find(
              (card) => card.id === partner.cardId,
            );
            return (
              <li key={partner.cardId}>
                <button
                  type="button"
                  className={cardDbPartnerPeekTileClass}
                  onClick={() => onSelectPartner(partner.cardId)}
                >
                  <CardDbCardThumb
                    cardId={partner.cardId}
                    name={partner.name}
                    element={catalogCard?.element}
                    cost={catalogCard?.cost}
                    kind={catalogCard?.kind}
                    className={cardDbPartnerPeekThumbClass}
                    fallbackClassName={cardDbPartnerPeekFallbackClass}
                  />
                  <span className={cardDbPartnerPeekNameClass}>
                    {partner.name}
                  </span>
                  <span className={partnerDeltaClass(partner.pairsWithMeDelta, "peek")}>
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
