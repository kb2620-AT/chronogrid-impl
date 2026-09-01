import Chronogrid.Basic

/-!
# Lemma 2.1 — Hierarchie-Konsistenz

Formalisierung von Lemma 2.1 aus CG-STD-0000 v0.9, Kap. 2.2 (Domain-Hierarchie).

Quelle (Originalwortlaut, Kap. 2.2):
„Sei D eine TimeDomain mit Hierarchie H = {h₁, …, hₙ}. Die Umrechnung zwischen
zwei beliebigen Hierarchieebenen hᵢ und hⱼ ist deterministisch und verlustfrei:
der Basiswert t ∈ ℤ∞ bleibt bei jeder Umrechnung erhalten."

Beweisskizze im Dokument: „(1) Der Zeitwert t ∈ ℤ∞ wird stets in der
Basisgranularität g gespeichert (Def. 1.2). Hierarchieebenen sind reine
Darstellungsschichten. (2) Jede Ebene hᵢ definiert einen ganzzahligen
Skalierungsfaktor factorᵢ ∈ ℕ. Die Umrechnung t_hᵢ = t div ∏factorⱼ ist in ℤ∞
stets wohldefiniert. (3) Verlustfreiheit: die Rückrechnung
t = t_hᵢ · ∏factorⱼ + rest ist exakt in ℤ∞."

Baut auf `chronogrid_prop_1_1_unique_representation` (Basic.lean, Prop. 1.1)
auf; Basic.lean und Mapping.lean bleiben unverändert.
-/

namespace ChronoGrid

/-- Präfixprodukt der Skalierungsfaktoren bis (ausschließlich) Index `i`:
`prefixProd factors i = factors[0] * factors[1] * … * factors[i-1]`.

Modelliert `∏factorⱼ` aus der Beweisskizze zu Lemma 2.1 (CG-STD-0000 v0.9,
Kap. 2.2, Punkt 2): den kumulierten Skalierungsfaktor der Hierarchieebene `hᵢ`
gegenüber der Basisgranularität. Für `i = 0` ist das leere Produkt `1`, d.h. die
Basisgranularität selbst; für `i ≥ factors.length` das Gesamtprodukt aller
Faktoren (`List.take` sättigt). -/
def prefixProd (factors : List ℤ) (i : ℕ) : ℤ :=
  (factors.take i).prod

/-- Basis-Baustein zu Lemma 2.1: Umrechnung zwischen dem Basiswert `t` und
**einer** Hierarchieebene `hᵢ` mit kumuliertem Faktor `F = prefixProd factors i`.

Aussage: es gibt genau ein Paar `(Quotient, Rest)` mit `t = Quotient · F + Rest`
und `0 ≤ Rest < F`. Das ist die formale Fassung von Punkt (2) und (3) der
Beweisskizze: die Umrechnung `t_hᵢ = t div F` ist wohldefiniert (Existenz), sie
ist deterministisch (Eindeutigkeit), und `t` ist aus dem Paar exakt
rekonstruierbar (`t = t_hᵢ · F + rest`).

`hpos` fordert nur die Positivität der tatsächlich verwendeten Faktoren
(`factors.take i`), nicht aller Faktoren der Liste — schwächste Voraussetzung,
die `F > 0` trägt.

Beweis: `F > 0` via `List.prod_pos`, dann Reduktion auf
`chronogrid_prop_1_1_unique_representation` (Prop. 1.1, Basic.lean) mit `g := F`. -/
theorem chronogrid_lemma_2_1_base_level
    (t : ℤ) (factors : List ℤ) (i : ℕ)
    (hpos : ∀ f ∈ factors.take i, f > 0) :
    let F := prefixProd factors i
    ∃! p : ℤ × ℤ, t = p.1 * F + p.2 ∧ 0 ≤ p.2 ∧ p.2 < F := by
  intro F
  have hF : F > 0 := List.prod_pos hpos
  exact chronogrid_prop_1_1_unique_representation t F hF

/-- **Lemma 2.1 — Hierarchie-Konsistenz** (CG-STD-0000 v0.9, Kap. 2.2).

Für zwei **beliebige** Hierarchieebenen `hᵢ` und `hⱼ` einer Domain gilt: beide
Ebenen-Ansichten sind aus demselben Basiswert `t` deterministisch ableitbar und
`t` bleibt dabei erhalten (aus jedem der beiden Paare exakt rekonstruierbar).

**Vorbehalte — bewusst am Symbol dokumentiert, da im Axiom-Log nur der
Funktionsname erscheint:**

(a) **Geltungsbereich: konstante ganzzahlige Faktoren.** Formalisiert ist der
Fall, in dem jede Ebene einen festen ganzzahligen Skalierungsfaktor besitzt
(`factors : List ℤ`, positiv) — so wie es die Beweisskizze im Dokument in
Punkt (2) voraussetzt („einen ganzzahligen Skalierungsfaktor factorᵢ ∈ ℕ").
Die in Def. 2.2 als Beispiel genannten Ebenen **Monat und Jahr („variabel")
sind damit NICHT erfasst**; nicht-konstante Divisoren (Monatslängen 28–31,
Schaltjahre) fallen aus diesem Modell heraus und bedürfen einer eigenen
Behandlung (vgl. piecewise-linear/nonlinear Mappings, Kap. 2.1/3.1).

(b) **„Verlustfrei" bezieht sich auf das Paar (Quotient, Rest), nicht auf
`t_hᵢ` allein.** `t div F` verliert für sich genommen den Rest; erhalten bleibt
`t` erst durch das Paar `(t div F, t mod F)`, entsprechend der Rückrechnung
`t = t_hᵢ · ∏factorⱼ + rest` in Punkt (3) der Beweisskizze. Die Aussage ist
daher über das Paar `p : ℤ × ℤ` formuliert, nicht über eine Injektivität von
`t ↦ t div F`. Letztere gilt nicht und wird hier auch nicht behauptet.

(c) **Formalisiert wird KEINE direkte `hᵢ → hⱼ`-Umrechnung.** Das Dokument
bezeichnet Hierarchieebenen ausdrücklich als „reine Darstellungsschichten"
(Beweisskizze, Punkt 1) und hält fest, dass „der Zeitwert t ∈ ℤ∞ stets in der
Basisgranularität" bleibt (Def. 2.2). Die „Umrechnung zwischen zwei beliebigen
Hierarchieebenen" ist daher als zwei **unabhängige Ableitungen aus demselben
unveränderten `t`** zu lesen, nicht als Berechnung von `hⱼ` aus `hᵢ`. Die
Konjunktion unten bildet genau das ab. Eine direkte Umrechnung `t_hᵢ → t_hⱼ`
ohne Zugriff auf `t` (bzw. den Rest) wäre für den Übergang zu feineren Ebenen
gar nicht verlustfrei und wird vom Dokument an keiner Stelle behauptet. -/
theorem chronogrid_lemma_2_1_hierarchy_consistency
    (t : ℤ) (factors : List ℤ) (i j : ℕ)
    (hposI : ∀ f ∈ factors.take i, f > 0)
    (hposJ : ∀ f ∈ factors.take j, f > 0) :
    let Fᵢ := prefixProd factors i
    let Fⱼ := prefixProd factors j
    (∃! pᵢ : ℤ × ℤ, t = pᵢ.1 * Fᵢ + pᵢ.2 ∧ 0 ≤ pᵢ.2 ∧ pᵢ.2 < Fᵢ) ∧
    (∃! pⱼ : ℤ × ℤ, t = pⱼ.1 * Fⱼ + pⱼ.2 ∧ 0 ≤ pⱼ.2 ∧ pⱼ.2 < Fⱼ) :=
  ⟨chronogrid_lemma_2_1_base_level t factors i hposI,
   chronogrid_lemma_2_1_base_level t factors j hposJ⟩

/-!
## Axiom-Verifikation (Nachweis: kein `sorry`, alle Beweise vollständig)
-/

#print axioms chronogrid_lemma_2_1_base_level
#print axioms chronogrid_lemma_2_1_hierarchy_consistency

end ChronoGrid
