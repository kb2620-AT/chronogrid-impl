# Contributing to ChronoGrid

Thank you for your interest in ChronoGrid. This document describes how to contribute
to the specification, the reference implementation, and the test suite.

---

## Types of Contributions

| Type | Examples |
|---|---|
| **Bug reports** | Incorrect test output, implementation diverges from spec |
| **Specification feedback** | Ambiguities, inconsistencies, missing edge cases |
| **Implementation fixes** | Code corrections with corresponding test coverage |
| **Test additions** | New test vectors for existing normative requirements |
| **Documentation** | Clarifications, typo fixes, translation |

**Not accepted at this stage:**
- New normative requirements (these require a CIP — see below)
- Changes to CG-STD-0000 mathematical foundations (pending external verification)
- Changes to the CGTA 6-tuple definition without CIP

---

## Change Integration Process (CIP)

All normative changes — to any CG-STD or CG-ORG document — require a formal
**Change Integration Proposal (CIP)** as defined in CG-ORG-2100 §4.

### CIP Workflow

1. **Open an Issue** describing the problem and proposed change.
2. **Label it** `CIP-candidate`.
3. The issue will be reviewed and either promoted to a formal CIP or closed with explanation.
4. Accepted CIPs receive a CIP number (e.g. `CIP-2026-003`) and are tracked in CG-ORG-2100.
5. Implementation follows after CIP acceptance, not before.

Non-normative changes (examples, documentation, README) do not require a CIP
and can be submitted directly as pull requests.

---

## Pull Request Guidelines

1. **One concern per PR** — do not mix normative and non-normative changes.
2. **Tests required** — any implementation change must include or update tests in `cg-testkit`.
3. **Golden Vector must be preserved** —
   `SHA-256("TAI:0:1.0") = f060329799216feb80f3561f8aeff77b64531737ea1da8624c391975b9ce89da`
   Run the full suite before submitting:
   ```bash
   tsx packages/cg-testkit/src/cli.ts --level 3   # must be 229/229
   npx vitest run --globals                         # must be 80/80
   ```
4. **No floating-point for time values** — `bigint` internally, `string` at API/DB boundaries.
   Any PR introducing `Number` for time values will be rejected (violates CG-E-003).
5. **No UPDATE on normative tables** — insert-only architecture (I-S1).

---

## Architecture Constraints

Before contributing code, read the three hard rules in the Entwickler-Briefing
(`/docs/ChronoGrid_Entwickler_Briefing.pdf`) and the architecture principles in README.md.

Key invariants that must never be violated:

| Invariant | Meaning |
|---|---|
| I-R1 (Th. 5.1) | Unique absolute value per domain |
| I-R2 (Th. 1.1) | Total order — not "t ≥ 0" |
| I-R3 (Th. 5.2) | Determinism — same input, same hash, always |
| I-D1 (Th. 2.1) | Domain immutability |
| I-S1 (Th. 5.3) | Timepoint immutability — no UPDATE |
| I-SEG-1 (Th. 5.5) | Segment isolation |

---

## Development Setup

See README.md → Quick Start.

```bash
node --version   # must be ≥ 22
pnpm --version   # must be ≥ 9
psql --version   # must be ≥ 14
```

---

## Communication

Questions about the specification or implementation:

**Kurt Bauer** — Initiator & Lead Author  
kurt@chronogrid.at · [chronogrid.at](https://chronogrid.at/preview)

Please use GitHub Issues for all technical discussions so they are publicly visible.
