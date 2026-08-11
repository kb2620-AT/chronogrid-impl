# ChronoGrid — Universal Time Addressing Standard (CGTA)

**ChronoGrid** is a formal, domain-aware time addressing standard for heterogeneous computer systems.
Core object: the **CGTA** (ChronoGrid Time Address) — a 6-tuple `(D, t, z, v, h, σ)` represented as:

```
CG:{DomainName}:{value}/v{version}
Example: CG:TAI:1742041937000000000/v1
```

All time values are integer arithmetic (ℤ∞ / BigInt) — no floating-point, no overflow, no ambiguity.

**Normalization target:** ASI/ON → CEN/CENELEC → ISO TC 154

---

## Project Status

| Component | Status |
|---|---|
| Normative specification | 21 documents — 8 CG-STD + 1 CG-ORG + 11 CG-APP (see [chronogrid.at/preview](https://chronogrid.at/preview)) |
| Reference implementation | cg-engine v0.9.0 — TypeScript/Node.js/PostgreSQL |
| Test suite | 248/248 cg-testkit CLI (104 L1 + 99 L2 + 45 L3) + 120/120 Vitest; 26 pending stubs counted, not executed |
| Conformance certificate | CG-CONF-002 — self-declared (see Limitations below) |
| External review | ❌ None to date — 4 enquiries sent (June–July 2026): BEV declined (referred to Austrian Standards), RISC/JKU and TU Wien declined (capacity), Uni Wien no reply. No external technical review of the specification or the implementation has taken place. |

---

## Current Limitations (honest disclosure)

Three blockers are documented and remain open:

**B-1 — No independent verification yet.**
All 18 formal assertions in CG-STD-0000 v0.9 are internally elaborated and self-checked.
External verification by qualified mathematicians/logicians is still outstanding: both institutions
approached, RISC/JKU Linz and TU Wien, declined for capacity reasons, and BEV referred the matter to
Austrian Standards, where no contact has been made. One qualification concerns the *kind* of
checking, not its independence: four of the assertions — I-R1, I-R2, I-M1 and Prop. 1.1 — are
mechanically verified in Lean 4/Mathlib and contain no `sorry`. That is a machine checking our own
proofs against our own formalisation; it is not an external assessment and leaves this blocker
in place.
The IGS run described under B-3 uses external *data*, but it is our own test, written and run by us —
it does not narrow this blocker.

**B-2 — Self-declared conformance certificate.**
CG-CONF-002 was issued by the same author who wrote the standard and the implementation.
Institutional independence is still absent: the first round of enquiries did not produce it, and no
institution has taken on a review of the standard or the certificate.

**B-3 — Level-3 claim scoped to core paths only.**
The Level-3 test suite passes on normative core paths (248/248).
Class-B relativistic mappings (RK45/Runge-Kutta-Fehlberg) are implemented in exact
BigInt arithmetic and active as T-L3-RK45-001–006. The SP3 orbit-file chain — writer
(SP3-d), exact-rational reader (SP3-c and -d), order-9 Lagrange interpolation with
analytic derivative — is active as T-L3-SP3-001–007, in both operating modes (velocity
records, and positions-only as real IGS Final products are delivered).

Since 2026-08-10 one of these tests runs against a real, downloaded IGS Final product (SP3-c,
record type P):
**T-L3-SP3-007** thins the 900 s grid to 1800 s and compares the thinned interpolant against
the omitted epochs, where the full interpolant sits on a node and returns the tabulated value
(Kronecker, T-RELB-073). Measured **|Δr|max = 1.360e-1 m against the 0.20 m threshold**
(CG-VERM-0101). This narrows B-3; it does not close it. What the run does *not* cover:

- **One satellite, one product, orbit position only.** It covers the orbit position of G01 from
  a single daily product of a single analysis centre. Other constellations, manoeuvres, outliers
  and the header variants of other analysis centres remain unverified.
- **It does not run when you clone this repository.** IGS products are excluded via `.gitignore`;
  the file has to be held locally under `monorepo/fixtures/igs-local/`. If it is missing, the
  test skips itself with a message and the group again proves only what T-L3-SP3-001–006 prove.
  In CI it always skips — whoever clones this repository sees 248/248 and has **not** executed
  the real-data check. Which of the two happened is readable from the result field `status`, not
  from the tick mark.
- **The velocity chain has no reference.** IGS Final carries no velocity records, so v is a
  derived quantity on both sides and the "reference" would carry a derivative error itself. That
  comparison is filed as T-L3-SP3-008, category *pending-Referenz*: not a missing implementation
  but a missing reference. Measured 7.035e-6 m/s against a 5e-6 m/s threshold; without a
  tabulated velocity it cannot be decided whether the threshold is too tight or the grid too
  coarse. Resolvable with a product carrying V-records, or against an independently integrated
  orbit.

Read "SP3 chain implemented" as "format written and read, interpolation exact, physics matches
the analytic references, orbit position checked once against one real product" — not as
"verified against IGS products".
26 test stubs remain documented open (v1.2 + Sprint-11B + 1 pending-Referenz).
The CLI output "Level-3 KONFORM" means: *Level-3-Suite green (core paths); 26 stubs documented open.*

---

## Repository Structure

```
/docs/specs    # API artifacts: OpenAPI schema, GraphQL schema, API test suite (YAML)
/packages
  cg-types/    # Shared types, error codes (CG-E-001…012), DTOs
  cg-ctddl/    # CG-STD-2100: CTDDL parser and validator
  cg-engine/   # CG-STD-3100: encode/decode, MachineID, CGFI, ArithChain, Allen
  cg-cguas/    # CG-STD-6100 Part A: segment logic, CGUA resolver
  cg-storage/  # CG-STD-4100 Ch. 3: 8 tables, migrations, repository
  cg-testkit/  # CG-STD-5100: normative test suite (248 tests + 26 pending stubs)
/apps
  cg-api/      # CG-STD-4100 Ch. 4–8: HTTP/GraphQL gateway (25 routes)
```

---

## Quick Start

**Prerequisites:** Node.js ≥ 22, pnpm ≥ 9, PostgreSQL ≥ 14

```bash
git clone https://github.com/kb2620-AT/chronogrid-impl.git
cd chronogrid-impl
pnpm install
pnpm build
```

**Run the test suite:**
```bash
# Full normative suite (248 tests)
tsx packages/cg-testkit/src/cli.ts --level 3

# Vitest (120 tests: CGUA + arithmetic + Class-B/RK45 + SP3)
npx vitest run --globals

# Golden Vector verification (must equal f060329799216feb80f3561f8aeff77b64531737ea1da8624c391975b9ce89da)
# SHA-256("TAI:0:1.0")
```

**Start the API server:**
```bash
pnpm --filter cg-api dev
curl http://localhost:3000/v1/health   # → 200 OK
```

---

## Architecture Principles

| Principle | Implementation | Normative Basis |
|---|---|---|
| No floating-point for time values | `bigint` internally, `string` at API/DB boundaries | CG-STD-3100 §2.6 |
| Insert-only storage | No UPDATE/DELETE on normative tables | CG-STD-4100 §2.1 (I-S1) |
| Pure-function engine | No network, no DB, no system clock in engine core | CG-STD-3100 §2.1–2.3 |
| Deterministic hashes | SHA-256 on canonical serialization (lexicographic key order, no whitespace) | CG-STD-3100 §5.1 (I-R3) |
| 89-bit address space | CGUA values: 0 to 2⁸⁹−1; overflow → CG-E-010.008 | CG-STD-6100 §3 |

---

## Key Technical Values

| Value | Canonical |
|---|---|
| CGUAS_MAX | 435 494 880 000 000 000 000 000 000 ns (~13.787 Gyr, Planck 2018) |
| Address space | 89-bit (2⁸⁹) |
| MachineID | SHA-256(name:dec(t):version) — σ-free |
| CGFI | SHA-256(taiNs:contentHash:typeId) — deterministic, seq-free |
| Auth | JWT HS256 (RS256/ES256 on roadmap for CG-STD-4100 v1.2) |
| Golden Vector | SHA-256("TAI:0:1.0") = `f060329799216feb80f3561f8aeff77b64531737ea1da8624c391975b9ce89da` |

---

## Specification Documents

The full normative stack (21 documents) is not distributed in this code repository; it is available at [chronogrid.at/preview](https://chronogrid.at/preview). This repo's `/docs/specs` contains only the machine-readable API artifacts (OpenAPI, GraphQL schema, API test suite).

| Layer | Document | Content |
|---|---|---|
| 0 — Mathematics | CG-STD-0000 v0.9 | Formal proofs, invariants, BigInt foundations |
| 1 — Time model | CG-STD-1100 v2.6 + CG-STD-1000 v1.4 | Architecture, CGTA, domains, epoch philosophy |
| 2 — Language | CG-STD-2100 v1.5 | CTDDL: ABNF grammar, JSON Schema, error codes |
| 3 — Engine | CG-STD-3100 v1.6 | Algorithms: encode/decode, MachineID, CGFI, ArithChain, Allen |
| 4 — Storage & API | CG-STD-4100 v1.1 | Data model (7 tables), REST/GraphQL, webhooks, auth |
| 5 — Address space | CG-STD-6100 v1.1 | CGUAS + CGFS, CGFI, segments, QKD, WORM |
| 6 — Governance | CG-ORG-2100 v1.6 + CG-STD-5100 v1.4 | Committees, CIP process, certification |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the Change Integration Process (CIP).

All normative changes require a CIP entry. Bug reports and implementation feedback welcome via Issues.

---

## License

- Source code: [Apache License 2.0](LICENSE-APACHE)
- Specification documents: [CC BY 4.0](LICENSE-CC)
- Trademarks: "ChronoGrid" and "CGTA" are trademark designations of ChronoGrid Systems, Neunkirchen NÖ, Austria.

---

## Contact

**Kurt Bauer** — Initiator & Principal Author  
ChronoGrid Systems · Neunkirchen, Niederösterreich, Austria  
kurt@chronogrid.at · [chronogrid.at](https://chronogrid.at/preview)
