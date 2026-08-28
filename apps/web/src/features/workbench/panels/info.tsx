"use client";

import type { ReactNode } from "react";
import { PanelTopline, SectionHeading } from "../ui";

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="info-card">
      <h3>{title}</h3>
      <div className="info-card-body">{children}</div>
    </article>
  );
}

export function InfoPanel() {
  return (
    <div className="info-mode">
      <PanelTopline
        variant="info"
        kicker="ABOUT FIRELINE"
        title="How the simulator works"
      >
        Fireline finds maximum-damage Fire Assassin (FiZa) lines for Grand
        Archive. It solves opening hands, samples deck damage, and explores
        ratio space under Mathematically Correct FiZa drill assumptions.
      </PanelTopline>

      <section className="info-section">
        <SectionHeading title="WORKBENCH" />
        <div className="info-card-grid">
          <InfoCard title="Hand solver">
            Draw a random 7-card opening hand from a saved deck, or build one
            card by card, then search for a maximum-damage line over a 2–5 turn
            horizon (3 by default). Deck mode shuffles a seeded pile, then draws from
            the top. The solve uses the opening hand plus those draws; Oracle
            keeps the leftover pile in order.
          </InfoCard>
          <InfoCard title="Decks">
            Create and edit saved decklists. A valid list needs at least 60
            recognized cards. After a deck has simulations, its cardlist is
            locked — duplicate it to edit.
          </InfoCard>
          <InfoCard title="Deck damage">
            Sample opening hands from a saved deck and report mean, P10, P50,
            P90, ending influence, and range. Manage lists on the Decks tab;
            this tab only runs samples.
          </InfoCard>
          <InfoCard title="Ratio lab">
            Start from a saved list, set cut budgets and a replacement pool,
            then sample unique legal lists by opening-hand damage.
          </InfoCard>
          <InfoCard title="History">
            Review completed sims and pool damage or card rates within one
            engine version. Simulation types stay on separate charts. Filter
            sample bars and the card board with min and max damage. Out-of-range
            bars stay visible, greyed out. Pooled mean, P10, P50, P90, and
            ending influence stay on the full set.
          </InfoCard>
        </div>
      </section>

      <section className="info-section">
        <SectionHeading title="SIMULATION TYPES" />
        <div className="info-card-grid">
          <InfoCard title="Fire brick (default)">
            Deterministic max-damage search. Every unknown draw is treated as an
            unplayable Fire Brick — blank draws with no peek. Headline damage is
            that brick-optimal line.
          </InfoCard>
          <InfoCard title="Monte Carlo — Sample">
            Needs a maindeck from the Decks tab. Shuffles the remaining deck for
            each rollout (1–48), solves optimally with that fixed draw queue,
            then reports P50 as the headline with mean, P10, P90, and min–max
            across rollouts.
          </InfoCard>
          <InfoCard title="Two-pass">
            Runs a fire-brick pass (unknown draws stay blank) and one oracle
            pass (a single shuffled remaining deck is known). Compare both
            lines; the gap is the value of knowing upcoming draws. Headline
            damage is the brick pass. The card leaderboard can show Fire brick,
            Oracle, or Combined attribution.
          </InfoCard>
          <InfoCard title="Oracle only">
            Needs a maindeck from the Decks tab. One shuffled remaining deck is
            known, then the solver finds the max-damage line against that draw
            queue. Same oracle pass as two-pass, without the brick comparison.
            Headline damage is that line.
          </InfoCard>
        </div>
      </section>

      <section className="info-section">
        <SectionHeading title="SHARED SETTINGS" />
        <div className="info-card-grid info-card-grid-3">
          <InfoCard title="Turn order">
            Going first or second. Going second draws one card at the start of
            your first turn. On turn one while going first, champion and ally
            attacks are blocked.
          </InfoCard>
          <InfoCard title="Turn horizon">
            Solve over 2–5 turns (3 by default). Each turn advances through Main,
            Materialize, Recollect, Agility, End, then the opponent’s main
            (cull), Wake, and the next materialize/recollect cycle.
          </InfoCard>
          <InfoCard title="Rollouts">
            Monte Carlo only — how many shuffled remaining decks to sample.
          </InfoCard>
        </div>
      </section>

      <section className="info-section">
        <SectionHeading title="RULES AND ASSUMPTIONS" />
        <article className="info-card info-card-wide">
          <h3>What the model assumes</h3>
          <ul className="info-list">
            <li>
              Unknown draws are unplayable fire bricks unless Monte Carlo, Oracle
              only, or the two-pass oracle supplies a draw queue.
            </li>
            <li>
              The opponent kills non-stealth, non-immortal allies during its main
              phase. Assassin class stealth (e.g. Tweedledum) only counts after
              Zander has leveled. Fast cards (e.g. Virgil, Demolition) can
              activate during
              materialize before recollect.
            </li>
            <li>
              Playing a Unique ally while a copy is already on the board kills
              the existing copy (graveyard, including On Death).
            </li>
            <li>
              Poisoned Dagger activates as soon as it is ready, so amplify
              applies to the rest of that turn.
            </li>
            <li>Arthur always attacks before other allies.</li>
            <li>Other ready allies attack together in one bulk step.</li>
            <li>
              An awake champion can attack by wielding an equipped weapon with no
              attack card (weapon power only). Attack cards still rest the
              champion; ally attacks do not.
            </li>
            <li>
              This is not a full rules engine or opponent AI. The reductions
              above cut search space where they do not change max damage.
            </li>
            <li>
              Champion is Zander; materials start as Impact Hammer, Mercenary’s
              Blade, Poisoned Dagger, and Zander, Varuckan Soulknife.
            </li>
            <li>
              Deck damage opens with 7 cards from a shuffled list. Only cards in
              the supported FiZa catalog are recognized.
            </li>
          </ul>
        </article>
      </section>

      <section className="info-section">
        <SectionHeading title="ENGINE VERSION" />
        <article className="info-card info-card-wide">
          <h3>What the footer string means</h3>
          <p>
            Every simulation is stamped with an engine version. The workbench
            footer shows it as{" "}
            <code>r18 · s1 · a8 · digest 78328050 · dev</code> (numbers match
            the running build).             History and the card database pool runs that share the same engine
            version (rules, sampler, and attribution) so cross-run stats stay
            comparable after code changes.
          </p>
          <ul className="info-list">
            <li>
              <strong>r (rules).</strong> Bumped manually when solver or model
              semantics change: combat rules, damage calculation, line search.
            </li>
            <li>
              <strong>s (sampler).</strong> Bumped manually when RNG, shuffle, or
              seed derivation changes.
            </li>
            <li>
              <strong>a (attribution).</strong> Bumped manually when stat
              attribution labels or parsing change. Card leaderboard aggregation
              requires a match; damage pooling uses r and s only.
            </li>
            <li>
              <strong>digest.</strong> First eight digits of a hash over every
              card attribute that affects simulation. Shown in the footer only;
              card data changes do not split pooled History or card database
              stats.
            </li>
            <li>
              <strong>build.</strong> Git commit SHA at compile time, or{" "}
              <code>dev</code> locally. Identifies the deployed binary only; not
              used for pooling.
            </li>
          </ul>
          <p>
            Two runs with different version strings are different epochs. Compare
            them side by side if you are measuring a change, but do not expect
            pooled History or leaderboard rows to mix across versions.
          </p>
        </article>
      </section>

      <section className="info-section">
        <SectionHeading title="READING RESULTS" />
        <article className="info-card info-card-wide">
          <h3>How to read the output</h3>
          <ul className="info-list">
            <li>
              Hand solver shows an optimal action line with damage, allies,
              memory, and hand after each step.
            </li>
            <li>
              Deck damage charts sample hands; click a bar for that hand’s line.
              Monte Carlo bars show P50 with a min–max range; two-pass shows
              brick and oracle side by side. Oracle only uses the same single-bar
              chart as fire brick.
            </li>
            <li>
              History pools only within one engine version so results stay
              comparable when the solver changes. Min and max damage grey out
              bars outside the band and rebuild the card board without changing
              pooled mean, P50, or P90.
            </li>
          </ul>
        </article>
      </section>
    </div>
  );
}
