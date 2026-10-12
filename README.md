# Cartograph

A dependency map of a public TypeScript or JavaScript repository, drawn from its real imports.

## Table of contents

- [Introduction](#introduction)
- [Tech stack](#tech-stack)
- [Features](#features)
- [Quick start](#quick-start)

## Introduction

More and more code ships without anyone on the team having read it. An agent wrote it, someone checked it worked, and it merged. The questions that come up afterwards are about structure: what this file is, what depends on it, and what breaks if it changes. Answering them by reading imports one file at a time stops working at around thirty files.

Cartograph answers them with a map. You paste a public GitHub repository URL and it parses every file, resolves every import to the file it really points at, and draws the result: folders as boxes, imports as lines.

One rule shapes everything else: **every box and every line comes from really parsing the code.** The AI explains what the parser found; it never decides that two files are connected. An import that can't be resolved isn't drawn. It is counted, with the reason. A map that is ninety percent right is worse than none, because there's no way to tell which ten percent is wrong.

The decisions behind the build, with their reasoning, are in [docs/project-doc.md](docs/project-doc.md). Each build phase has a spec in [docs/specs/](docs/specs/).

## Tech stack

| Area | Choice |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript in strict mode |
| Parsing | ts-morph |
| Map | React Flow, laid out with dagre |
| Auth and organizations | Clerk |
| Data | Supabase: Postgres, row-level security and realtime |
| AI | OpenAI SDK through a single wrapped client, traced with LangSmith |
| Styling | Tailwind CSS v4 |
| Package manager | pnpm |

The parser can run on its own. It takes a directory and returns files, edges and a coverage report, without importing Next.js, React or the database client. Knowledge about frameworks lives in separate adapters, not in the parser.

## Features

- **A real dependency graph.** Imports, re-exports, dynamic `import()` and `require()` calls become edges, but only when they resolve to a real file in the repository.
- **The map.** Folders fold into boxes so a large repository fits on one screen, and open into their files when clicked. Select a file to see its incoming imports in green and its outgoing imports in amber.
- **Blast radius and dependency chain.** Everything that may break if a file changes, and everything it needs, two steps out. Both are calculated from the edge list, not estimated.
- **Framework awareness.** Next.js, NestJS, Express and React conventions give each file a role (pages, controllers, services, hooks and so on), and colour on the map shows the role's tier. Routes are shown for Next.js and NestJS, and only when the full path can be read exactly from the code. No routes are shown for Express, because Express assembles them at runtime.
- **Coverage report.** Every analysis says how much of the repository was parsed, and why the rest wasn't.
- **Live progress** while a repository is being parsed.
- **Explanations.** Ask about a file or a folded folder and get a paragraph written from it and its real neighbours. Answers are cached per organization, and every call is traced, cache hits included.
- **Labels for unknown files.** A file no convention identifies can be labelled while it's explained, from a short fixed list that never includes pages, routes or controllers.
- **Organizations.** Every analysis belongs to an organization. Who can read a row is enforced by Postgres row-level security, not by application code.
- **Evals.** A check for file paths the AI invented, plus role accuracy, run as scripts against stored data.

Cartograph deliberately doesn't give scores or ratings, read private repositories, show approximate routes, or support languages other than TypeScript and JavaScript.

## Quick start

### Prerequisites

- Node.js 24 (the command-line scripts run `.ts` files directly with `node`)
- pnpm 10
- A [Clerk](https://clerk.com) application with Organizations enabled
- A [Supabase](https://supabase.com) project
- An OpenAI API key
- Optional: a LangSmith API key, for tracing

### 1. Install

```bash
pnpm install
```

### 2. Configure

Create `.env.local` in the project root. The app refuses to start if any required value is missing.

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

# OpenAI
OPENAI_API_KEY=

# LangSmith (optional)
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=
```

### 3. Connect Clerk and Supabase

- In Supabase, add Clerk as a third-party auth provider. Row-level security policies read the organization from the Clerk session token.
- In the Clerk Dashboard, go to **Sessions → Customize session token** and add:

  ```json
  { "org_name": "{{org.name}}" }
  ```

### 4. Set up the database

Apply the migrations in [supabase/migrations/](supabase/migrations/) in order, for example with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 5. Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Signed out, you'll see the landing page. Paste a public repository URL, sign in, and the analysis starts.

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` | ESLint |
| `pnpm parse <directory> [--out result.json]` | Run the parser alone on a local directory |
| `pnpm analyse <github-url> --org <org_id> [--rerun]` | Run the whole pipeline from a terminal, writing to the database |
| `pnpm eval:paths`, `eval:roles`, `eval:prompts`, `eval:datasets` | Run the evals |
