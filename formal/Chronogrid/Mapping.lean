import Mathlib
import Chronogrid.Basic

/-!
# Theorem 3.2 — Kompositionsfähigkeit (Klasse A)

Formalisierung von CG-STD-0000 v0.9, Kap. 3.2:
„Seien M_{A→B} und M_{B→C} zwei Klasse-A-Mappings. Ihre Komposition M_{A→C} ist
ebenfalls ein Klasse-A-Mapping und eine Funktion. Mapping-Ketten beliebiger Länge
bis zum normativen Chain-Limit von 8 sind stets Funktionen."

## Designentscheidung: eigene ℚ→ℚ-Definition statt Änderung von `classAMapping`

`Chronogrid.Basic.classAMapping` hat die Signatur `ℚ → ℚ → ℤ → ℚ`, also
ℤ-Eingabe (Zeitwert nach Def. 1.1) und ℚ-Ausgabe (nach Def. 3.3). Diese
Asymmetrie ist für Theorem 3.1 korrekt, macht aber die Komposition
M_{B→C} ∘ M_{A→B} nicht typkorrekt: die Ausgabe von M_{A→B} liegt in ℚ, die
Eingabe von M_{B→C} verlangt ℤ.

Aufgelöst wird das hier durch eine **zusätzliche** Definition `classAMappingQ`
auf ℚ → ℚ — eine Verallgemeinerung von `classAMapping` auf ℚ-Eingabe, die für
die Komposition nötig ist. `Basic.lean` bleibt dabei unverändert: die
bestehende Formalisierung von Theorem 3.1 wird nicht angetastet. Der
Zusammenhang zwischen beiden Definitionen wird stattdessen über die kanonische
Einbettung ℤ ↪ ℚ (`Int.cast`) hergestellt und als Lemma
`classAMappingQ_int_cast` explizit bewiesen — nicht durch Umschreiben der
ℤ-Version. Auf dem Bild von ℤ stimmen beide Definitionen überein; jede Aussage
über `classAMappingQ` überträgt sich damit auf die ℤ-Eingabe aus Theorem 3.1.

Diese Entscheidung ist bewusst und explizit: sie wird hier dokumentiert und
nicht stillschweigend durch eine Signaturänderung in `Basic.lean` beseitigt.
-/

namespace ChronoGrid

/-!
## Klasse-A-Mapping auf ℚ (Def. 3.3, verallgemeinert)

M(t) = a·t + b. Wie bei `classAMapping` ist die Nebenbedingung a ≠ 0 aus
Def. 3.3 nicht in die Definition kodiert; sie wird für die hier bewiesenen
Aussagen (Abschluss, Funktionseigenschaft) nicht gebraucht — die Komposition
ist auch für a = 0 wohldefiniert und wieder von derselben Form.
-/

def classAMappingQ (a b : ℚ) (t : ℚ) : ℚ := a * t + b

/-- Brücke zu Theorem 3.1: auf ganzzahligen Eingaben ist `classAMappingQ` die
kanonische Fortsetzung von `classAMapping` (Basic.lean) entlang ℤ ↪ ℚ. -/
theorem classAMappingQ_int_cast (a b : ℚ) (t : ℤ) :
    classAMappingQ a b (t : ℚ) = classAMapping a b t := rfl

/-!
## 1. Abschluss unter Komposition — Kern von Theorem 3.2

Die Beweisskizze im Dokument nennt nur „Kompositionssatz für Funktionen".
Hier wird stattdessen die stärkere, konstruktive Aussage bewiesen: die
Komposition ist nicht bloß irgendeine Funktion, sondern wieder ein
Klasse-A-Mapping mit explizit angegebenen Koeffizienten

    a₃ = a₂ · a₁ ,  b₃ = a₂ · b₁ + b₂ .
-/

/-- Explizite Koeffizienten der Komposition zweier Klasse-A-Mappings. -/
theorem classAMappingQ_comp (a₁ b₁ a₂ b₂ : ℚ) :
    classAMappingQ a₂ b₂ ∘ classAMappingQ a₁ b₁
      = classAMappingQ (a₂ * a₁) (a₂ * b₁ + b₂) := by
  funext t
  simp only [Function.comp_apply, classAMappingQ]
  ring

/-- Theorem 3.2 (Abschluss): die Komposition zweier Klasse-A-Mappings ist
wieder ein Klasse-A-Mapping. -/
theorem chronogrid_th_3_2_closure (a₁ b₁ a₂ b₂ : ℚ) :
    ∃ a₃ b₃ : ℚ,
      classAMappingQ a₂ b₂ ∘ classAMappingQ a₁ b₁ = classAMappingQ a₃ b₃ :=
  ⟨a₂ * a₁, a₂ * b₁ + b₂, classAMappingQ_comp a₁ b₁ a₂ b₂⟩

/-!
## 2. Funktionseigenschaft der Komposition (I-M1, analog Theorem 3.1)

Gleiches ∃!-Muster wie `chronogrid_th_3_1_mapping_uniqueness`: für jeden
Eingabewert t gibt es genau einen Ausgabewert.
-/

/-- Theorem 3.2 (Funktionseigenschaft, I-M1): die Komposition zweier
Klasse-A-Mappings liefert zu jedem Eingabewert genau einen Ausgabewert.
Gleiches ∃!-Muster wie `chronogrid_th_3_1_mapping_uniqueness` in Basic.lean. -/
theorem chronogrid_th_3_2_comp_uniqueness (a₁ b₁ a₂ b₂ t : ℚ) :
    ∃! y : ℚ, y = (classAMappingQ a₂ b₂ ∘ classAMappingQ a₁ b₁) t :=
  ⟨(classAMappingQ a₂ b₂ ∘ classAMappingQ a₁ b₁) t, rfl, fun _y hy => hy⟩

/-!
## 3. Mapping-Ketten beliebiger Länge

Eine Mapping-Kette ist eine Liste von Koeffizientenpaaren `(a, b) : ℚ × ℚ`.
`chainApply` faltet sie über `classAMappingQ`, in Listenreihenfolge: der Kopf
der Liste ist das zuerst angewandte Mapping (A→B), das nächste Element das
darauf folgende (B→C). Die leere Kette ist die Identität.

**Achtung, die beiden Reihenfolgen sind zueinander invers.** Die Liste läuft
chronologisch — der Kopf wird zuerst angewandt, also A→B, dann B→C, dann C→D.
Die ∘-Schreibweise der Spezifikation läuft umgekehrt: in
M_{A→C} = M_{B→C} ∘ M_{A→B} steht das zuerst angewandte Mapping rechts. Beide
Konventionen bezeichnen dieselbe Abbildung. `chainApply_pair` unten ist die
Brücke zwischen ihnen und macht die Umkehrung maschinengeprüft statt bloß
behauptet: dort landet der Listenkopf `(a₁, b₁)` rechts vom ∘.
-/

/-- Faltung einer Mapping-Kette über `classAMappingQ`. Der Listenkopf ist das
**zuerst** angewandte Mapping; die Liste läuft damit chronologisch und invers
zur ∘-Schreibweise der Spezifikation (Brücke: `chainApply_pair`). Die leere
Kette ist die Identität. -/
def chainApply : List (ℚ × ℚ) → ℚ → ℚ
  | [], t => t
  | m :: ms, t => chainApply ms (classAMappingQ m.1 m.2 t)

/-- Konsistenz von `chainApply` mit der binären Komposition aus Abschnitt 1. -/
theorem chainApply_pair (a₁ b₁ a₂ b₂ : ℚ) :
    chainApply [(a₁, b₁), (a₂, b₂)]
      = classAMappingQ a₂ b₂ ∘ classAMappingQ a₁ b₁ := by
  funext t
  simp [chainApply]

/-- Theorem 3.2 (Ketten): die Faltung einer Kette **beliebiger** Länge ist
wieder ein Klasse-A-Mapping. Beweis per Induktion über die Liste — das ist
genau die Induktion über die Kettenlänge n: der Basisfall ist n = 0 (leere
Kette, Identität = `classAMappingQ 1 0`), der Schritt hängt ein weiteres
Mapping vor eine Kette der Länge n und liefert die Koeffizienten aus
`classAMappingQ_comp`. -/
theorem chronogrid_th_3_2_chain_isClassA :
    ∀ ms : List (ℚ × ℚ), ∃ a b : ℚ, chainApply ms = classAMappingQ a b := by
  intro ms
  induction ms with
  | nil =>
      refine ⟨1, 0, ?_⟩
      funext t
      simp [chainApply, classAMappingQ]
  | cons m ms' ih =>
      obtain ⟨a, b, hab⟩ := ih
      refine ⟨a * m.1, a * m.2 + b, ?_⟩
      funext t
      simp only [chainApply, hab, classAMappingQ]
      ring

/-- Dieselbe Aussage längenindiziert: für **jedes** n : ℕ ist jede Kette der
Länge n ein Klasse-A-Mapping. Die Längenhypothese wird im Beweis nicht
gebraucht — genau das ist die Aussage: die Eigenschaft ist längenunabhängig. -/
theorem chronogrid_th_3_2_chain_isClassA_length (n : ℕ) :
    ∀ ms : List (ℚ × ℚ), ms.length = n →
      ∃ a b : ℚ, chainApply ms = classAMappingQ a b :=
  fun ms _ => chronogrid_th_3_2_chain_isClassA ms

/-- Funktionseigenschaft (I-M1) für Ketten beliebiger Länge. -/
theorem chronogrid_th_3_2_chain_uniqueness (ms : List (ℚ × ℚ)) (t : ℚ) :
    ∃! y : ℚ, y = chainApply ms t :=
  ⟨chainApply ms t, rfl, fun _y hy => hy⟩

/-!
### Korollar: das normative Chain-Limit 8

CG-STD-2100, Kap. 4 begrenzt Mapping-Ketten auf 8 Glieder. Das Korollar
unten ist der Spezialfall `length ≤ 8` des allgemeinen n-Falls; die
Hypothese `ms.length ≤ 8` wird im Beweis bewusst nicht verwendet.

**Was hier bewiesen wird und was nicht.** Bewiesen ist ausschließlich die
Wohldefiniertheit: eine Kette von höchstens 8 Klasse-A-Mappings ist wieder
ein Klasse-A-Mapping und damit eine Funktion. Nicht bewiesen — und hier auch
nicht modelliert — ist das Verhalten *bei Überschreitung*. Das Limit 8 ist in
der Implementierung (`monorepo/packages/cg-engine/src/engine.ts`,
`convertValue`, Parameter `max = 8`) eine Laufzeit-Ablehnung: bei mehr als 8
Gliedern wird CG-E-005.010 (MappingError.chainTooLong) geworfen, geprüft von
T-L1-041. Das ist eine normative Begrenzung, keine mathematische Schranke —
oberhalb von 8 bleibt die Faltung mathematisch wohldefiniert, wie
`chronogrid_th_3_2_chain_isClassA` zeigt. Diese Datei reimplementiert die
Ablehnung nicht und trifft keine Aussage über sie.
-/

/-- Korollar zum normativen Chain-Limit 8 (CG-STD-2100 Kap. 4).

WARNUNG für die Begutachtung: die Hypothese `ms.length ≤ 8` wird im Beweis
**nicht verwendet** — der Beweisterm ist `chronogrid_th_3_2_chain_isClassA`
für beliebige Länge. Dieses Korollar belegt daher *nicht*, dass das Limit 8
geprüft oder durchgesetzt wird. Belegt ist ausschließlich, dass Ketten bis zu
8 Gliedern wohldefiniert sind — als Spezialfall einer Aussage, die auch
oberhalb von 8 gilt. Die Durchsetzung des Limits ist Laufzeitverhalten der
Implementierung (`cg-engine/src/engine.ts`, `convertValue`, CG-E-005.010,
T-L1-041) und hier weder modelliert noch behauptet. -/
theorem chronogrid_th_3_2_chain_limit_8 :
    ∀ ms : List (ℚ × ℚ), ms.length ≤ 8 →
      ∃ a b : ℚ, chainApply ms = classAMappingQ a b :=
  fun ms _ => chronogrid_th_3_2_chain_isClassA ms

/-!
## Axiom-Verifikation (Nachweis: kein `sorry`, alle Beweise vollständig)
-/

#print axioms classAMappingQ_int_cast
#print axioms classAMappingQ_comp
#print axioms chronogrid_th_3_2_closure
#print axioms chronogrid_th_3_2_comp_uniqueness
#print axioms chainApply_pair
#print axioms chronogrid_th_3_2_chain_isClassA
#print axioms chronogrid_th_3_2_chain_isClassA_length
#print axioms chronogrid_th_3_2_chain_uniqueness
#print axioms chronogrid_th_3_2_chain_limit_8

end ChronoGrid
