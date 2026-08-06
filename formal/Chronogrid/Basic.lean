import Mathlib

/-!
# ChronoGrid — Mechanized Verification (Pilot)

Formalisierung ausgewählter Kerntheoreme aus CG-STD-0000 v0.8.
Quelle: CG-STD-0000, Kap. 1.2 (Prop. 1.1), Kap. 1.3 (Th. 1.1),
Kap. 3.2 (Th. 3.1), Kap. 5 (Th. 5.1).
-/

namespace ChronoGrid

/-!
## Theorem 1.1 — Totale Ordnung auf ℤ∞ (Invariante I-R2)
CG-STD-0000, Kap. 1.3, S. 3–4.
-/

theorem chronogrid_th_1_1_total_order (t₁ t₂ : ℤ) : t₁ ≤ t₂ ∨ t₂ ≤ t₁ :=
  le_total t₁ t₂

example : LinearOrder ℤ := inferInstance

/-!
## Proposition 1.1 — Eindeutigkeit der Darstellung
CG-STD-0000, Kap. 1.2, S. 3. HINWEIS: im A3-Auftrag fälschlich als
„Theorem 5.1" bezeichnet — im Dokument tatsächlich Proposition 1.1.
-/

theorem chronogrid_prop_1_1_unique_representation
    (t g : ℤ) (hg : g > 0) :
    ∃! p : ℤ × ℤ, t = p.1 * g + p.2 ∧ 0 ≤ p.2 ∧ p.2 < g := by
  have existence : t % g + g * (t / g) = t ∧ 0 ≤ t % g ∧ t % g < g :=
    (Int.ediv_emod_unique hg).mp ⟨rfl, rfl⟩
  have hcomm1 : g * (t / g) = (t / g) * g := mul_comm g (t / g)
  have heq1 : t = (t / g) * g + t % g := by linarith [existence.1, hcomm1]
  refine ⟨(t / g, t % g), ⟨heq1, existence.2.1, existence.2.2⟩, ?_⟩
  rintro ⟨q', r'⟩ ⟨heq, hr0, hrg⟩
  have hcomm2 : q' * g = g * q' := mul_comm q' g
  have h1 : r' + g * q' = t := by linarith [heq, hcomm2]
  have hu : t / g = q' ∧ t % g = r' := (Int.ediv_emod_unique hg).mpr ⟨h1, hr0, hrg⟩
  simp only [Prod.mk.injEq]
  exact ⟨hu.1.symm, hu.2.symm⟩

/-!
## Theorem 3.1 — Mapping-Eindeutigkeit (I-M1)

CG-STD-0000, Kap. 3.2, S. 9–10:
„Jedes Klasse-A-Mapping M_{A→B} ist eine Funktion: für jeden Eingabewert
t ∈ ℤ∞_A gibt es genau einen Ausgabewert M_{A→B}(t) ∈ ℤ∞_B."

Definition 3.3: M_{A→B}(t) = a·t + b, mit a = p/q (rational, a ≠ 0),
b ∈ ℚ (Referenzpunkt-abgeleitet). Formalisiert mit a, b : ℚ, t : ℤ
(Zeitwert per Def. 1.1), Ausgabe in ℚ gemäß Def. 3.3. Mathematisch
trivial — jede Funktion liefert per Definition genau einen Output je Input.
-/

def classAMapping (a b : ℚ) (t : ℤ) : ℚ := a * (t : ℚ) + b

theorem chronogrid_th_3_1_mapping_uniqueness (a b : ℚ) (t : ℤ) :
    ∃! y : ℚ, y = classAMapping a b t :=
  ⟨classAMapping a b t, rfl, fun _y hy => hy⟩

/-!
## Theorem 5.1 — Eindeutiger Zeitwert (I-R1)
CG-STD-0000, Kap. 5, S. 12 — formale Grundlage für I-R1.
Mathematisch trivial (Definition 1.3: Zeitpunkt = Paar).
-/

structure Zeitpunkt where
  t : ℤ
  D : String

theorem chronogrid_th_5_1_unique_time_value (P : Zeitpunkt) :
    ∃! t : ℤ, t = P.t :=
  ⟨P.t, rfl, fun _t' ht' => ht'⟩

/-!
## Axiom-Verifikation (Nachweis: kein `sorry`, alle Beweise vollständig)
-/

#print axioms chronogrid_th_1_1_total_order
#print axioms chronogrid_prop_1_1_unique_representation
#print axioms chronogrid_th_3_1_mapping_uniqueness
#print axioms chronogrid_th_5_1_unique_time_value

end ChronoGrid
