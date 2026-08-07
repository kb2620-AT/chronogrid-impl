# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

ChronoGrid is a **time-addressing standard** (CGTA — a 6-tuple `(D, t, z, v, h, σ)` serialized as
`CG:{Domain}:{value}/v{version}`) plus its reference implementation. The code exists to demonstrate
conformance with normative specification documents (CG-STD-*, CG-ORG-*, CG-APP-*) that live outside
this repo at chronogrid.at/preview. **Spec text is the authority; code follows it, not the reverse.**

Consequence for any change: source comments cite normative clauses (`CG-STD-3100 v1.6 §5.1`),
invariant IDs (`I-R1`, `I-S1`, `I-SEG-1`), error codes (`CG-E-005.010`), and test IDs
(`T-ENG-104`). Preserve those citations when editing, and add them for new code.

## Layout — three implementations, one root

The repo root is not the workspace. Three independent implementations of the same normative core
must agree, and CI cross-checks them:

| Path | What | Toolchain |
|---|---|---|
| `monorepo/` | Primary TypeScript reference implementation (pnpm workspace) | Node ≥ 22, pnpm ≥ 9 |
| `cg_verify.py` | Python second implementation — golden-vector / anchor verification only | Python 3.11, stdlib only |
| `formal/` | Lean 4 + Mathlib mechanization of CG-STD-0000 theorems | elan / lake, Lean v4.32.0 |
| `docs/specs/` | Machine-readable API artifacts: `openapi.yaml`, `schema.graphql`, `T-API-testsuite.yaml` | — |

`cg_verify.py` deliberately does **not** call the TypeScript runtime; it re-derives SHA-256 anchors
independently from hardcoded golden-vector literals. Keeping the two in sync is manual — a change to
`computeMachineId`, `computeCGFI`, `convertValue`, or the Allen-relation cascade in TS must be
mirrored there, or the `golden-vector-crosscheck` CI job fails.

## Commands

All pnpm/node commands run from `monorepo/` (there is no root `package.json`).

```bash
pnpm install
pnpm build                    # tsc --build across the project-reference graph

pnpm test                     # cg-testkit CLI, Level 3 — must be 229/229
npx vitest run --globals      # Vitest — must be 80/80 (CGUA 30 + ARITH 50)
pnpm test:report              # same suite + writes conformance-report.json

pnpm api:dev                  # http://127.0.0.1:3000, in-memory storage
docker compose up -d          # PostgreSQL 16 (schema.sql auto-applied) + pgAdmin :5050
pnpm pg:test                  # 6-check live DB probe
STORAGE=postgres pnpm api:pg  # API against PostgreSQL
```

From the repo root:

```bash
python cg_verify.py --verbose          # Python second implementation
cd formal && lake exe cache get && lake build   # Lean; then `lake env lean Chronogrid/Basic.lean` prints axioms
```

### Running a subset of tests

The cg-testkit CLI (`packages/cg-testkit/src/cli.ts`) accepts only `--level 1|2|3`, `--json`, and
`--report` — **there is no test-ID filter**. `--level 1` (101 tests) or `--level 2` (197) is the fast
loop; to isolate one case, temporarily narrow the `allTests` array in `cli.ts` and revert before
committing. Vitest is the only runner with real filtering:

```bash
npx vitest run --globals packages/cg-cguas/src/cgua.test.ts
npx vitest run --globals -t "T-ARITH-012"
```

Vitest only covers `cg-cguas/src/cgua.test.ts` and `cg-engine/src/cg-zeitarithmetik.test.ts`;
everything else lives in the hand-rolled testkit runner (`suites/t-*.ts`, plain
`{id, level, run, expected}` records compared with a custom `deepEqual`).

## Package graph

Dependencies flow strictly downward; never introduce a back-edge.

```
cg-types      errors (CG-E-001…012 factory), domain types — depends on nothing
  └ cg-ctddl  CTDDL parser/validator (CG-STD-2100)
      └ cg-engine   encode/decode, MachineID, CGFI, mappings, Allen, Gregorian (CG-STD-3100)
          ├ cg-cguas     89-bit address space, SegmentRegistry (CG-STD-6100)
          ├ cg-usecases  UC1–UC5 domain definitions (CG-APP-0600)
          └ cg-storage   repositories: in-memory + PostgreSQL (CG-STD-4100 Ch. 3)
              └ cg-api   node:http server, 25 routes, GraphQL, webhooks, JWT (CG-STD-4100 Ch. 4–8)
                  └ cg-testkit  normative suite — imports everything, including cg-api
```

Packages resolve via `exports` pointing at **`.ts` sources** (not `dist/`), with `.js` specifiers in
import paths per NodeNext (`import{Errors}from'cg-types/errors.js'` resolves to `src/errors.ts`).
Everything runs through `node --import tsx/esm`; `pnpm build` type-checks but is not needed to run.

`cg-api` has no web framework — routing, body parsing, and param matching are hand-written in
`apps/cg-api/src/server.ts`. BigInt is serialized to string in the `JSON.stringify` replacer there.

## Hard constraints

These are enforced by tests and CI, and PRs violating them are rejected (see CONTRIBUTING.md):

- **No floating-point for time values.** `bigint` internally, `string` at API and DB boundaries.
  Introducing `Number` for a time value violates CG-E-003. In Python, integer arithmetic with
  explicit truncation — no `/`.
- **Golden Vector is frozen:** `SHA-256("TAI:0:1.0")` =
  `f060329799216feb80f3561f8aeff77b64531737ea1da8624c391975b9ce89da`. Three CI jobs check it.
  This pins the MachineID preimage format to `` `${name}:${dec(t)}:${version}` `` — σ-free.
- **Insert-only storage (I-S1 / I-D1).** No UPDATE/DELETE on normative tables; PostgreSQL enforces it
  with `cg_block_mutation()` BEFORE UPDATE OR DELETE triggers (`cg-storage/src/schema.sql`). Status
  changes (publish/tombstone/revoke) are appended as new event rows.
- **Pure engine.** `cg-engine` performs no I/O — no network, no DB, no ambient clock inside the core
  transforms. `nowTaiNs()` is the single clock touchpoint and is injected into `APIContext.now`.
- **TAI−UTC = 37 s** (constant since 2017-01-01) — this is the *offset*, not the leap-second count.
  Conflating the two was a real past bug (commit `7997bdc`). TS carries the full leap table in
  `cg-engine/src/mapping.ts`; Python carries only the current offset.
- **CGUAS_MAX = 435494880000000000000000000 ns** (~13.787 Gyr, Planck 2018), an 89-bit space.
  Overflow raises CG-E-010.006/.008 via `cgua_safeAdd`.
- **Errors are always constructed through the `Errors` factory** in `cg-types/src/errors.ts`, which
  fixes code, class, severity, thrower, and HTTP status together. Never throw a bare `Error` for a
  condition the spec assigns a code to.
- **Auth is HS256 JWT only.** No OAuth. `JWT_SECRET` is mandatory when `NODE_ENV=production`
  (fail-fast); dev/test generate an ephemeral per-process secret, which is why in-process tests
  issuing and verifying tokens work without configuration.

## Code style

Most TypeScript in this repo is written **whitespace-minified** — single-line functions, no spaces
around operators or after commas (`cg-engine/src/engine.ts`, `apps/cg-api/src/*.ts`,
`cg-testkit/src/*.ts`). A few files are conventionally formatted (`cg-cguas/src/cguas.ts`,
`cg-types/src/errors.ts` partly). Match whichever style the file you are editing already uses; do not
reformat a minified file as a side effect of a change, since it destroys the diff.

Comments, test descriptions, CLI output, and commit messages are predominantly **German**. Keep new
comments in the language of the surrounding file.

Commit subjects follow the project's own change vocabulary — `fix(FIX-15): …`, `Sprint-11B: …`,
`CG-FIX-C: …`, `A3: …` — alongside conventional `docs:`/`chore:`. Normative changes require a CIP
issue first (CG-ORG-2100 §4); implementation-only fixes do not.

## Conformance claims — be precise

The CLI prints "LEVEL 3 KONFORM" but this is scoped. `t-l3-pending.ts` holds ~30 `skip: true` stubs
that are counted and reported but never executed (WORM/OAIS, geo-redundancy, RK45 Class-B
relativistic mappings, GraphQL subscriptions, mTLS event bus, anchoring audit). The certificate is
self-declared and no independent verification exists yet. When writing docs, reports, or commit
messages, do not round this up to unqualified conformance — the README's "Current Limitations"
section (B-1/B-2/B-3) is the phrasing to reuse.

## Repo hygiene

The working tree accumulates untracked PowerShell fix scripts (`Apply-FIX*.ps1`, `cg-*.ps1`),
scan reports, and log files at both root and `monorepo/`; `monorepo/{packages` is a stray directory
from a malformed shell command. These are not part of the build — do not import from them or treat
them as sources of truth. `.gitignore` also excludes all specification binaries (`*.docx`, `*.pdf`,
`ChronoGrid-docs/`) because the authoritative documentation lives in Google Drive, not here.
