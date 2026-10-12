import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { MapFigure, ReachFigure, ResolveFigure } from "../../components/landing-figures";
import { ThemeControl } from "../theme-control";

// Signed-out visitors reach this through the root; the proxy rewrites "/" here.
// Same tokens, fonts and controls as the product, so the two can't drift.

export const metadata: Metadata = {
  title: "Cartograph",
  description: "A dependency map of a public TypeScript or JavaScript repository, drawn from its real imports.",
};

const COLUMN = "mx-auto w-full max-w-[1140px] px-6";
// Measure caps: beside a figure, and across a full-width section.
const NARROW = "max-w-[46ch]";
const WIDE = "max-w-[64ch]";
const PROSE = "text-[15px] leading-relaxed text-muted";
const H2 = "text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.025em]";

export default function WelcomePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <WhatItDoes />
        <HowItWorks />
        <Frameworks />
        <WhatItDoesNot />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface">
      <div className={`${COLUMN} flex h-12 items-center justify-between gap-3`}>
        <span className="font-mono text-xs">cartograph</span>
        <div className="flex items-center gap-3">
          <ThemeControl />
          <Link
            href="/sign-in"
            className="flex h-6 items-center rounded border border-line px-2 text-[11px] hover:border-muted"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className={`${COLUMN} flex min-h-[calc(88svh-3rem)] items-center py-16`}>
      <div className="grid w-full items-center gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-20">
        <div>
          <h1 className="max-w-[14ch] text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
            The shape of a codebase, read from its imports.
          </h1>
          <p className={`${PROSE} ${NARROW} mt-6`}>
            Paste a public TypeScript or JavaScript repository. Every file is parsed, every import is resolved to the
            file it really points at, and the result is drawn as a map: folders as boxes, imports as lines.
          </p>
          {/* A plain GET form, so it works before any script loads. The target
              is protected: signing in comes first, then the analysis starts
              with this URL. */}
          <form action="/start" method="get" className={`mt-8 ${NARROW}`}>
            <div className="flex items-center gap-2">
              <input
                name="url"
                type="text"
                required
                spellCheck={false}
                autoComplete="off"
                placeholder="https://github.com/owner/repository"
                aria-label="Public GitHub repository URL"
                className="h-9 min-w-0 flex-1 rounded-sm border border-line bg-raised px-2.5 font-mono text-xs outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="h-9 shrink-0 rounded-sm bg-accent px-4 text-xs font-medium text-white"
              >
                Analyse
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Public repositories only. Sign in with GitHub, Google or email; no access to your repositories is asked
              for.
            </p>
          </form>
        </div>
        <MapFigure />
      </div>
    </section>
  );
}

function Section({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section aria-label={label} className="border-t border-line">
      <div className={`${COLUMN} py-24 md:py-32`}>{children}</div>
    </section>
  );
}

function Split({ text, figure }: { text: ReactNode; figure: ReactNode }) {
  return (
    <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-20">
      <div>{text}</div>
      {figure}
    </div>
  );
}

function WhatItDoes() {
  return (
    <Section label="What it does">
      <Split
        text={
          <>
            <h2 className={`${H2} max-w-[16ch]`}>Select a file. See what it touches.</h2>
            <p className={`${PROSE} ${NARROW} mt-6`}>
              Folders fold into boxes so a large repository fits on one screen, and open into their files when you
              click them. Select a file and the lines leading into it turn green, the lines leading out turn amber.
            </p>
            <p className={`${PROSE} ${NARROW} mt-4`}>
              Its blast radius is every file that may break if it changes, two steps out. Its dependency chain is
              everything it needs, the same distance the other way. Both are counted over the import list, not
              estimated.
            </p>
          </>
        }
        figure={<ReachFigure />}
      />
    </Section>
  );
}

const STEPS: { title: string; body: string }[] = [
  {
    title: "Parse",
    body: "Imports, re-exports, dynamic imports and require() calls are read from the syntax of every file and resolved to the file they reach. What couldn't be parsed or resolved is counted, with the reason.",
  },
  {
    title: "Map",
    body: "Folders become boxes and imports become lines, laid out left to right. Progress shows live while a large repository is parsed.",
  },
  {
    title: "Explain",
    body: "Ask about a file and get a paragraph written from that file and its real neighbours, the files it imports and the files importing it. Answers are cached for the organization, so asking again doesn't ask the model again.",
  },
];

function HowItWorks() {
  return (
    <Section label="How it works">
      <Split
        text={
          <>
            <h2 className={`${H2} max-w-[16ch]`}>Every line on the map is an import that resolved.</h2>
            <ol className="mt-8 space-y-6">
              {STEPS.map((step) => (
                <li key={step.title}>
                  <h3 className="text-[15px] font-medium">{step.title}</h3>
                  <p className={`${PROSE} ${NARROW} mt-1.5`}>{step.body}</p>
                </li>
              ))}
            </ol>
            <p className={`${PROSE} ${NARROW} mt-8`}>
              An analysis belongs to your organization. A repository is mapped once, and everyone in the organization
              starts from that map.
            </p>
          </>
        }
        figure={<ResolveFigure />}
      />
    </Section>
  );
}

const FRAMEWORKS: { name: string; body: string }[] = [
  {
    name: "Next.js",
    body: "Pages, API routes, server actions, layouts, loading and error files and middleware, from where each file sits. Routes come from the same positions.",
  },
  {
    name: "NestJS",
    body: "Controllers, resolvers, services, modules, guards, interceptors, pipes, filters, entities and DTOs, from their filename suffixes. Routes come from the controller and method decorators together.",
  },
  {
    name: "Express",
    body: "Routers, controllers, services and middleware, from the folders they sit in. No routes: Express assembles them at runtime, so no path in the code is known to be the one a request matches.",
  },
  {
    name: "React",
    body: "Components and hooks, from their naming conventions. React has no routing of its own, so none is shown.",
  },
  {
    name: "Anything else",
    body: "Still parsed and mapped in full. Tests, config and scripts are recognised whatever the framework.",
  },
];

function Swatch({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="mr-1.5 inline-block size-2 rounded-sm align-[0.05em]"
      style={{ background: colour }}
    />
  );
}

function Frameworks() {
  return (
    <Section label="Frameworks">
      <h2 className={`${H2} max-w-[20ch]`}>It knows what a framework calls things.</h2>
      <p className={`${PROSE} ${WIDE} mt-6`}>
        The framework is read from the repository&apos;s package.json, and its conventions give each file a role.
        Colour on the map is the role&apos;s tier: <Swatch colour="var(--tier-surface)" />
        routable surfaces, <Swatch colour="var(--tier-layer)" />
        the layers behind them, <Swatch colour="var(--tier-plumbing)" />
        plumbing. A file no convention names stays unclassified, unless an explanation of it gives it a label from a
        short fixed list; that never includes a page, a route or a controller.
      </p>
      <dl className="mt-12 border-t border-line">
        {FRAMEWORKS.map((f) => (
          <div key={f.name} className="grid gap-2 border-b border-line py-5 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
            <dt className="text-[15px] font-medium">{f.name}</dt>
            <dd className={`${PROSE} ${WIDE}`}>{f.body}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

const REFUSALS: { title: string; body: string }[] = [
  {
    title: "It doesn't guess connections.",
    body: "A line exists because an import resolved to a real file. An import that can't be resolved isn't drawn; it's counted, with the reason.",
  },
  {
    title: "It doesn't let the model decide structure.",
    body: "Explanations are written after the map exists, from the files around the one you asked about. The model never adds a line or walks the graph.",
  },
  {
    title: "It doesn't approximate routes.",
    body: "If a route can't be read exactly from the code, no route is shown. A wrong route is the same failure as an invented line.",
  },
  {
    title: "It doesn't skip files quietly.",
    body: "Every analysis reports how much of the repository was parsed, and why the rest wasn't.",
  },
  {
    title: "It doesn't grade the code.",
    body: "No scores, ratings, severity or issue counts. It explains a codebase; it doesn't review one.",
  },
  {
    title: "It doesn't read private repositories.",
    body: "No repository permission is requested and no token is stored. TypeScript and JavaScript only.",
  },
];

function WhatItDoesNot() {
  return (
    <Section label="What it doesn't do">
      <h2 className={`${H2} max-w-[20ch]`}>What it deliberately doesn&apos;t do.</h2>
      <p className={`${PROSE} ${WIDE} mt-6`}>
        A dependency map that is ninety percent right is worse than none, because there&apos;s no way to tell which
        ten percent is wrong. So where the code doesn&apos;t say, the map says nothing.
      </p>
      <ul className="mt-14 grid gap-x-20 gap-y-10 md:grid-cols-2">
        {REFUSALS.map((r) => (
          <li key={r.title}>
            <h3 className="text-[15px] font-medium">{r.title}</h3>
            <p className={`${PROSE} ${NARROW} mt-1.5`}>{r.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className={`${COLUMN} flex flex-wrap items-center justify-between gap-3 py-8 text-[11px] text-muted`}>
        <span className="font-mono">cartograph</span>
        <span>Public TypeScript and JavaScript repositories, mapped from their imports.</span>
      </div>
    </footer>
  );
}
