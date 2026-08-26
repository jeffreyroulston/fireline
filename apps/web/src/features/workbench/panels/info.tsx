"use client";

import type { ReactNode } from "react";

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
      <div className="info-topline">
        <p className="kicker">ABOUT FIRELINE</p>
        <h2>How the simulator works</h2>
        <p>
          Fireline finds maximum-damage Fire Assassin (FiZa) lines for Grand
          Archive. It solves opening hands, samples deck damage, and explores
          ratio space under Mathematically Correct FiZa drill assumptions.
        </p>
      </div>

      <section className="info-section">
        <div className="section-heading">
          <span>WORKBENCH</span>
        </div>
        <div className="info-card-grid">
          <InfoCard title="Hand solver">
            Draw a random 7-card opening hand from a saved deck, or build one
            card by card, then search for a maximum-damage line over a 2- or
            3-turn horizon.
          </InfoCard>
          <InfoCard title="Decks">
            Create and edit saved decklists. A valid list needs at least 60
            recognized cards. After a deck has simulations, its cardlist is
            locked — duplicate it to edit.
          </InfoCard>
          <InfoCard title="Deck damage">
            Sample opening hands from a saved deck and report mean, P50, P90,
            and range. Manage lists on the Decks tab; this tab only runs
            samples.
          </InfoCard>
          <InfoCard title="Ratio lab">
            Start from a saved list, set cut budgets and a replacement pool,
            then sample unique legal lists by opening-hand damage.
          </InfoCard>
          <InfoCard title="History">
            Review completed sims and pool damage or card rates within one
            engine version. Simulation types stay on separate charts.
          </InfoCard>
        </div>
      </section>

      <section className="info-section">
        <div className="section-heading">
          <span>SIMULATION TYPES</span>
        </div>
        <div className="info-card-grid">
          <InfoCard title="Fire brick (default)">
            Deterministic max-damage search. Every unknown draw is treated as an
            unplayable Fire Brick — blank draws with no peek. Headline damage is
            that brick-optimal line.
          </InfoCard>
          <InfoCard title="Monte Carlo — Sample">
            Needs a maindeck from the Decks tab. Shuffles the remaining deck for
            each rollout (1–48), solves optimally with that fixed draw queue,
            then reports P50 as the headline with mean, P90, and min–max across
            rollouts.
          </InfoCard>
          <InfoCard title="Two-pass">
            Runs a fire-brick pass (unknown draws stay blank) and one oracle
            pass (a single shuffled remaining deck is known). Compare both
            lines; the gap is the value of knowing upcoming draws. Headline
            damage is the brick pass.
          </InfoCard>
        </div>
      </section>

      <section className="info-section">
        <div className="section-heading">
          <span>SHARED SETTINGS</span>
        </div>
        <div className="info-card-grid info-card-grid-3">
          <InfoCard title="Turn order">
            Going first or second. On turn one while going first, champion and
            ally attacks are blocked.
          </InfoCard>
          <InfoCard title="Turn horizon">
            Solve over 2 or 3 turns. Each turn advances through Main,
            Materialize, Recollect, Agility, End, then the opponent’s main
            (cull), Wake, and the next materialize/recollect cycle.
          </InfoCard>
          <InfoCard title="Rollouts">
            Monte Carlo only — how many shuffled remaining decks to sample.
          </InfoCard>
        </div>
      </section>

      <section className="info-section">
        <div className="section-heading">
          <span>RULES AND ASSUMPTIONS</span>
        </div>
        <article className="info-card info-card-wide">
          <h3>What the model assumes</h3>
          <ul className="info-list">
            <li>
              Unknown draws are unplayable fire bricks unless Monte Carlo or the
              two-pass oracle supplies a draw queue.
            </li>
            <li>
              The opponent kills non-stealth, non-immortal allies during its main
              phase. Assassin class stealth (e.g. Tweedledum) only counts after
              Zander has leveled. Fast allies (e.g. Virgil) can activate during
              materialize before recollect.
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
        <div className="section-heading">
          <span>READING RESULTS</span>
        </div>
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
              brick and oracle side by side.
            </li>
            <li>
              History pools only within one engine version so results stay
              comparable when the solver changes.
            </li>
          </ul>
        </article>
      </section>
    </div>
  );
}
