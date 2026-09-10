import Chronogrid.Basic
import Chronogrid.Mapping

/-!
# Korollar 3.1 — Keine Zeitinformation geht verloren

Formalisierung von Korollar 3.1 aus CG-STD-0000 v0.9, Kap. 3.2 — **ausschließlich
für den linearen Fall nach Definition 3.3**.

Quelle (Originalwortlaut, Kor. 3.1):
„Jedes Klasse-A-Mapping M_{A→B} mit a ≠ 0 ist injektiv; auf seinem Bild existiert
die Umkehrabbildung M_{B→A}(u) = (u − b)/a, die selbst ein Klasse-A-Mapping mit
rationalem Koeffizienten 1/a ist. Kein Zeitwert wird auf denselben Zielwert wie
ein anderer abgebildet — die Zeitinformation ist vollständig rekonstruierbar."

Beweisskizze im Dokument: „Lineare Mappings M(t) = at + b mit a ≠ 0 sind
injektiv: aus at₁ + b = at₂ + b folgt t₁ = t₂. Die Umkehrabbildung
M⁻¹(u) = (u−b)/a ist auf dem Bild M(ℤ∞_A) definiert und nach Definition 3.3
selbst ein Klasse-A-Mapping (rationaler Koeffizient 1/a). Surjektivität auf ganz
ℤ∞ ist nicht erforderlich — maßgeblich ist die exakte Rekonstruierbarkeit jedes
abgebildeten Zeitwerts. Normative Anforderung: Referenzpunkte und Koeffizienten
müssen so gewählt sein, dass die Rückabbildung auf dem relevanten Extent
Ganzzahl-Ergebnisse liefert (CG-STD-2100 Kap. 5.3)."

Baut auf `classAMapping` (Basic.lean, Def. 3.3 / Th. 3.1) und `classAMappingQ`
(Mapping.lean, ℚ-Fortsetzung) auf; Basic.lean, Mapping.lean, Hierarchy.lean und
ReferencePoint.lean bleiben unverändert.

## Geltungsbereich: nur Definition 3.3 (linear)

Diese Datei deckt **ausschließlich** den linearen Fall nach Definition 3.3 ab.
Der piecewise-lineare Fall nach **Definition 3.4 ist ausdrücklich NICHT Teil
dieser Formalisierung** — gleiche Abgrenzung wie in ReferencePoint.lean
(Theorem 3.3) und wie in Kap. 5.6 des Dokuments („piecewise-lineare … Mappings
sind nicht Teil dieses Pilotumfangs").

Begründung, über den Pilotumfang hinaus: die **ungeklärte normative Lücke**
zwischen Definition 3.4 und der Totalitätsbehauptung in der Beweisskizze zu
Theorem 3.1 — die Verknüpfung zwischen Segmenten und Extent ist nicht festgelegt
— ist unverändert offen (ausführliche Begründung im Modul-Docstring von
ReferencePoint.lean). Für Korollar 3.1 kommt eine **zweite**, eigenständige Lücke
hinzu: ein piecewise-lineares Mapping ist im Allgemeinen auch bei durchweg
`aᵢ ≠ 0` **nicht** injektiv (fallende und steigende Segmente können denselben
Zielwert treffen; bei Schaltsekunden-Rücksprüngen ist genau das der praktisch
relevante Fall). Injektivität wäre dort also keine Folgerung aus `aᵢ ≠ 0`,
sondern eine zusätzliche normative Anforderung an die Segmentfolge, die das
Dokument nicht formuliert. Solange beides normativ offen ist, wird hier keine
Aussage über piecewise-lineare Mappings getroffen und auch keine implizit mit
abgedeckt.

## Typwahl: Hinrichtung über ℤ, Umkehrabbildung notwendig über ℚ

Anders als bei Theorem 3.3 genügt hier **eine** Typebene nicht; die beiden
Richtungen leben zwangsläufig auf verschiedenen Ebenen:

* **Hinrichtung** `classAMapping : ℚ → ℚ → ℤ → ℚ` (Basic.lean). Die Eingabe ist
  ein Zeitwert nach Def. 1.1, also ℤ∞ ≙ `ℤ`; die Ausgabe ist nach Def. 3.3
  rational. Injektivität wird deshalb als `Function.Injective (classAMapping a b)`
  formuliert — also genau über die Funktion, die Theorem 3.1 formalisiert, ohne
  Signaturänderung.
* **Umkehrabbildung** `classAMappingQ` (Mapping.lean), also ℚ → ℚ. Eine
  ℤ-Eingabe wäre hier **sachlich falsch**: das Argument der Umkehrabbildung ist
  ein Wert der Zieldomäne, und dieser ist nach Def. 3.3 im Allgemeinen rational
  (`b ∈ ℚ`, `a = p/q`). Eine ℤ-Signatur für M_{B→A} würde eine Ganzzahligkeit
  unterstellen, die Def. 3.3 nicht behauptet. Zusätzlich ist der **Wert**
  (u − b)/a im Allgemeinen selbst nicht ganzzahlig.

Die Brücke zwischen beiden Ebenen ist das bereits bewiesene Lemma
`classAMappingQ_int_cast` (Mapping.lean): auf dem Bild von ℤ stimmen beide
Definitionen überein. Deshalb ist `chronogrid_kor_3_1_left_inverse` (ℤ-Eingabe)
eine echte Aussage über `classAMapping` und nicht bloß über deren ℚ-Fortsetzung.

## Die Exaktheitsbedingung: drei Lesarten, zwei Bedingungen, ein Befund

Der Satz der Beweisskizze — „Referenzpunkte und Koeffizienten müssen so gewählt
sein, dass die Rückabbildung auf dem relevanten Extent Ganzzahl-Ergebnisse
liefert" — spricht ausdrücklich von der **Rückabbildung**. Er lässt drei
Lesarten zu, die hier auseinandergehalten werden:

1. **„Ganzzahl-Ergebnisse auf dem Bild von M".** Diese Lesart ist ohne jede
   Zusatzvoraussetzung erfüllt: aus `u = M(t)` folgt `M⁻¹(u) = t ∈ ℤ`
   (`chronogrid_kor_3_1_preimage_integral`). Als Anforderung an die Wahl von
   Referenzpunkt und Koeffizienten ist sie damit **normativ leer** — sie schränkt
   keine Wahl ein.
2. **„Ganzzahl-Ergebnisse auf ganzzahligen Zielwerten".** Das ist die einzige
   Lesart, unter der der Satz eine echte Anforderung an die Rückabbildung
   ausdrückt: für jedes `u ∈ ℤ` soll `(u − b)/a ∈ ℤ` sein. Formalisiert als
   `InverseIntegral`.
3. **Ganzzahligkeit der Hinrichtung.** Die Behauptung „die Zeitinformation ist
   vollständig rekonstruierbar" ist für ℤ∞ nur dann tragfähig, wenn der
   Zwischenwert `M(t)` in der Zieldomäne überhaupt **darstellbar** ist, also in
   ℤ∞_B liegt. Das betrifft nicht die Rück-, sondern die Hinrichtung und ist als
   `ForwardIntegral` formalisiert. Es folgt nicht aus Def. 3.3 (Gegenbeispiel
   `a = 1/2`, `b = 0`, `t = 1`: `M(t) = 1/2 ∉ ℤ`).

**`ForwardIntegral` und `InverseIntegral` sind unvergleichbar** — keine der
beiden Bedingungen folgt aus der anderen. Das ist unten maschinengeprüft
(`chronogrid_kor_3_1_forward_not_inverse`,
`chronogrid_kor_3_1_inverse_not_forward`) und nicht bloß behauptet. Welche der
beiden gemeint ist, entscheidet der Dokumentwortlaut daher nicht mit; die
Zuordnung der Rekonstruierbarkeitsbehauptung zu `ForwardIntegral` ist eine
**Interpretation dieser Formalisierung, kein Zitat**.

### Quellenlage zum Verweis „CG-STD-2100 Kap. 5.3"

Der Querverweis wurde gegen CG-STD-2100 v1.5 geprüft und ist dort **nicht
auflösbar**: Kapitel 5 trägt die Überschrift „JSON Schema (normative
Validierungsreferenz)" und hat keine Unterabschnitte; ein Kapitel 5.3 existiert
nicht. Die Wörter „Ganzzahl", „rational", „Rundung", „Umkehr", „invers" und
„injektiv" kommen im gesamten Dokument nicht vor. Eine normative Anforderung an
Ganzzahl-Ergebnisse **der Rückabbildung** ist in CG-STD-2100 v1.5 somit nicht
belegt — weder in Kap. 5 noch anderswo.

Belegt ist dort ausschließlich eine Typangabe zur **Hinrichtung**, in Kap. 4.6
(„Mapping-Block (Klasse A — Funktionen)"): „Klasse-A-Mappings (linear,
piecewise-linear, nonlinear) sind Funktionen ℤ∞ → ℤ∞." Diese Angabe entspricht
`ForwardIntegral` und trifft keine Aussage über die Rückabbildung. Solange die
Quelle nicht geklärt ist, wird `ForwardIntegral` hier deshalb **nicht** als
Zitat aus CG-STD-2100 Kap. 5.3 geführt, sondern als benannte Hypothese dieser
Formalisierung.

### Reichweite beider Definitionen

Beide Bedingungen sind über **ganz ℤ** formuliert, nicht über einen Extent
E = [t_min, t_max] nach Def. 2.1 — der Extent ist in dieser Formalisierung nicht
modelliert. Sie sind damit stärker als eine auf den Extent eingeschränkte
Fassung; die aus ihnen abgeleiteten Aussagen sind entsprechend schwächer und
behaupten nichts über Mappings, die nur auf ihrem Extent ganzzahlig sind.

Wie in ReferencePoint.lean gilt: „exakt" heißt hier **Gleichheit in ℚ**, nicht
eine Fehlerschranke. Rundungsfreiheit ist eine Eigenschaft des Trägertyps — ℚ
ist exakte Bruchrechnung, ein Gleitkommamodell existiert hier nicht. Dass eine
konkrete Implementierung tatsächlich exakt rechnet, ist eine Aussage über den
Code und hier weder modelliert noch behauptet.

## Die Voraussetzung `a ≠ 0` — hier anders als bei Theorem 3.3

In Basic.lean, Mapping.lean und ReferencePoint.lean wurde die Nebenbedingung
`a ≠ 0` aus Def. 3.3 bewusst **nicht** mitgeführt, weil sie für die dortigen
Aussagen nicht gebraucht wird. Hier ist es umgekehrt: `a ≠ 0` ist für Korollar
3.1 **unverzichtbar** und wird deshalb als explizite Hypothese geführt — das
Korollar nennt sie auch selbst im Wortlaut. Dass sie nicht bloß mitgeschleppt,
sondern notwendig ist, wird an zwei Stellen durch Gegenbeispiel-Sätze belegt:
`chronogrid_kor_3_1_a_ne_zero_necessary` (Injektivität) und
`chronogrid_kor_3_1_isClassA_needs_a_ne_zero` (Klasse-A-Form der
Umkehrabbildung).

## Surjektivität wird nicht behauptet

Das Korollar hält ausdrücklich fest: „Surjektivität auf ganz ℤ∞ ist nicht
erforderlich." Dem folgt diese Datei. Die Umkehrabbildung wird auf dem **Bild**
verankert (`chronogrid_kor_3_1_preimage_integral`); dass die Hinrichtung ℤ → ℤ
im Allgemeinen nicht surjektiv ist, wird unten an einem konkreten Gegenbeispiel
gezeigt (`chronogrid_kor_3_1_not_surjective_onto_int`), damit die schwächere
Aussage nicht versehentlich als Bijektivität auf ℤ∞ gelesen wird. Bijektiv ist
das Mapping erst auf der ℚ-Ebene — das wird als
`chronogrid_kor_3_1_bijective_on_Q` separat und ausdrücklich über ℚ formuliert.
-/

namespace ChronoGrid

/-- Die **Umkehrabbildung** M_{B→A}(u) = (u − b)/a eines Klasse-A-Mappings
(Kor. 3.1, CG-STD-0000 v0.9, Kap. 3.2), geschrieben in Klasse-A-Normalform
M(u) = a'·u + b' mit `a' = 1/a` und `b' = −b/a`.

Bewusst als `classAMappingQ`-Instanz definiert und nicht als freier Term
`(u - b) / a`: damit ist die Klasse-A-Form der Umkehrabbildung bereits in der
Definition sichtbar. Die Übereinstimmung mit der Bruchform des Dokuments wird in
`invClassAMappingQ_eq` bewiesen.

Die Definition ist auch für `a = 0` wohlgeformt (`a⁻¹ = 0` in ℚ nach
Mathlib-Konvention); sie ist dann aber keine Umkehrabbildung. Alle Aussagen
unten, die das behaupten, führen `a ≠ 0` als Hypothese. -/
def invClassAMappingQ (a b : ℚ) : ℚ → ℚ := classAMappingQ a⁻¹ (-(b / a))

/-- Die Definition stimmt für `a ≠ 0` mit der Bruchform (u − b)/a aus dem
Wortlaut von Korollar 3.1 überein. -/
theorem invClassAMappingQ_eq (a b : ℚ) (ha : a ≠ 0) (u : ℚ) :
    invClassAMappingQ a b u = (u - b) / a := by
  simp only [invClassAMappingQ, classAMappingQ]
  field_simp
  ring

/-- Korollar 3.1, Teil 2 (Form der Umkehrabbildung): M_{B→A} ist selbst ein
Klasse-A-Mapping mit einem Koeffizienten `1/a`, der wieder von null verschieden
ist — die Umkehrabbildung erfüllt also ihrerseits die Nebenbedingung aus
Def. 3.3 und ist damit erneut umkehrbar.

„Klasse A" ist hier im Sinne der ℚ-Fortsetzung `classAMappingQ` (Mapping.lean)
zu lesen, genau wie bei Theorem 3.2 — nicht im Sinne der ℤ-Eingabe von
`classAMapping`; zur Begründung siehe den Abschnitt „Typwahl" im
Modul-Docstring.

Die Gleichheit `invClassAMappingQ a b = classAMappingQ a⁻¹ (-(b / a))` ist
definitorisch (`rfl`) und trägt für sich genommen keine inhaltliche Last. Der
Gehalt der Aussage steckt in `a' ≠ 0` sowie in `invClassAMappingQ_eq` (Form
(u − b)/a) und den Lemmata zur Links- und Rechtsinversen (die Abbildung leistet
tatsächlich die Umkehrung).

Dass die Hypothese `a ≠ 0` hier gebraucht wird und nicht bloß mitgeführt ist,
zeigt `chronogrid_kor_3_1_isClassA_needs_a_ne_zero`: für `a = 0` existiert
überhaupt kein `a' ≠ 0` mit dieser Darstellung. -/
theorem chronogrid_kor_3_1_inverse_isClassA (a b : ℚ) (ha : a ≠ 0) :
    ∃ a' b' : ℚ, a' = a⁻¹ ∧ a' ≠ 0 ∧ invClassAMappingQ a b = classAMappingQ a' b' :=
  ⟨a⁻¹, -(b / a), rfl, inv_ne_zero ha, rfl⟩

/-- Die Voraussetzung `a ≠ 0` ist für die Klasse-A-Form der Umkehrabbildung
**notwendig**: für `a = 0` existiert **keine** Klasse-A-Darstellung der
Umkehrformel mit `a' ≠ 0` — gleichgültig, welcher Koeffizient gewählt wird.

Die Aussage legt `a'` bewusst **nicht** mehr fest (frühere Fassung forderte
zusätzlich `a' = (0 : ℚ)⁻¹`) und ist damit echt stärker: sie schließt alle
Koeffizienten aus, nicht nur einen bestimmten.

Beweis: `invClassAMappingQ 0 b` ist die konstante Nullfunktion; Auswertung der
Funktionsgleichheit an den Stellen 0 und 1 liefert `a' = 0` im Widerspruch zu
`a' ≠ 0`.

Offen festgehalten: dass `invClassAMappingQ 0 b` konstant ist, beruht auf der
**Mathlib-Konvention** `0⁻¹ = 0` (und `b / 0 = 0`) — eine Konvention des
Trägertyps, keine Aussage von Def. 3.3, die den Fall `a = 0` schlicht
ausschließt. Die Aussage hängt insofern an dieser Konvention; sie legt aber,
anders als die frühere Fassung, keinen Koeffizienten `a'` mehr fest und trifft
damit keine verdeckte Aussage über den Wert von `0⁻¹`.

Gegenstück zu `chronogrid_kor_3_1_inverse_isClassA`. -/
theorem chronogrid_kor_3_1_isClassA_needs_a_ne_zero (b : ℚ) :
    ¬ ∃ a' b' : ℚ, a' ≠ 0 ∧ invClassAMappingQ 0 b = classAMappingQ a' b' := by
  rintro ⟨a', b', hne, heq⟩
  have h0 := congrFun heq 0
  have h1 := congrFun heq 1
  norm_num [invClassAMappingQ, classAMappingQ] at h0 h1
  exact hne (by linarith)

/-!
## 1. Injektivität (Kern von Korollar 3.1)
-/

/-- **Korollar 3.1, Teil 1 — Injektivität** (CG-STD-0000 v0.9, Kap. 3.2,
linearer Fall nach Def. 3.3).

„Jedes Klasse-A-Mapping M_{A→B} mit a ≠ 0 ist injektiv."

Formuliert über `classAMapping` aus Basic.lean, also mit ℤ∞-Eingabe nach
Def. 1.1. Beweis wie in der Beweisskizze: aus `a·t₁ + b = a·t₂ + b` folgt
`a·(t₁ − t₂) = 0`, mit `a ≠ 0` also `t₁ = t₂` in ℚ und damit in ℤ.

Geltungsbereich: **nur Def. 3.3 (linear)**; siehe Modul-Docstring. -/
theorem chronogrid_kor_3_1_injective (a b : ℚ) (ha : a ≠ 0) :
    Function.Injective (classAMapping a b) := by
  intro t₁ t₂ h
  simp only [classAMapping] at h
  have hz : a * ((t₁ : ℚ) - (t₂ : ℚ)) = 0 := by ring_nf; linarith
  have hsub : (t₁ : ℚ) - (t₂ : ℚ) = 0 := (mul_eq_zero.mp hz).resolve_left ha
  have hq : (t₁ : ℚ) = (t₂ : ℚ) := by linarith
  exact_mod_cast hq

/-- Korollar 3.1, Nachsatz: „Kein Zeitwert wird auf denselben Zielwert wie ein
anderer abgebildet." Das ist die Kontraposition der Injektivität und wird hier
eigens ausformuliert, weil der Dokumentwortlaut in dieser Richtung steht. -/
theorem chronogrid_kor_3_1_no_collision (a b : ℚ) (ha : a ≠ 0) (t₁ t₂ : ℤ)
    (hne : t₁ ≠ t₂) : classAMapping a b t₁ ≠ classAMapping a b t₂ :=
  fun h => hne (chronogrid_kor_3_1_injective a b ha h)

/-- Die Voraussetzung `a ≠ 0` ist **notwendig**, nicht bloß mitgeführt: für
`a = 0` ist das Mapping konstant und damit nicht injektiv. Damit ist belegt,
dass die Hypothese in den Aussagen oben echte Arbeit leistet — anders als in
Basic.lean, Mapping.lean und ReferencePoint.lean, wo sie weggelassen werden
konnte. -/
theorem chronogrid_kor_3_1_a_ne_zero_necessary (b : ℚ) :
    ¬ Function.Injective (classAMapping 0 b) := by
  intro h
  have h01 : (0 : ℤ) = 1 := h (by simp [classAMapping])
  exact absurd h01 (by decide)

/-!
## 2. Umkehrabbildung und exakte Rekonstruierbarkeit
-/

/-- Die Umkehrabbildung ist Linksinverse auf der ℚ-Ebene. -/
theorem invClassAMappingQ_leftInverse (a b : ℚ) (ha : a ≠ 0) (t : ℚ) :
    invClassAMappingQ a b (classAMappingQ a b t) = t := by
  simp only [invClassAMappingQ, classAMappingQ]
  field_simp
  ring

/-- Die Umkehrabbildung ist Rechtsinverse auf der ℚ-Ebene. -/
theorem invClassAMappingQ_rightInverse (a b : ℚ) (ha : a ≠ 0) (u : ℚ) :
    classAMappingQ a b (invClassAMappingQ a b u) = u := by
  simp only [invClassAMappingQ, classAMappingQ]
  field_simp
  ring

/-- **Korollar 3.1, Teil 3 — exakte Rekonstruierbarkeit** auf ℤ∞-Eingaben:
M_{B→A}(M_{A→B}(t)) = t für jeden Zeitwert `t ∈ ℤ∞_A`.

Die Aussage steht über `classAMapping` (ℤ-Eingabe, Basic.lean) und ist damit
eine Aussage über genau die in Theorem 3.1 formalisierte Funktion; die Brücke
zur ℚ-Fortsetzung ist `classAMappingQ_int_cast` (Mapping.lean).

Die Gleichheit ist eine Gleichheit in ℚ (exakte Bruchrechnung); zur Reichweite
von „exakt" siehe den Modul-Docstring. -/
theorem chronogrid_kor_3_1_left_inverse (a b : ℚ) (ha : a ≠ 0) (t : ℤ) :
    invClassAMappingQ a b (classAMapping a b t) = (t : ℚ) := by
  rw [← classAMappingQ_int_cast a b t]
  exact invClassAMappingQ_leftInverse a b ha (t : ℚ)

/-- **Lesart 1 der Exaktheitsbedingung — „Ganzzahl-Ergebnisse auf dem Bild".**

Auf dem Bild M(ℤ∞_A) liefert die Umkehrabbildung stets ein Ganzzahl-Ergebnis,
und zwar genau das Urbild. Die Aussage braucht keine Zusatzvoraussetzung, weil
`u` per Voraussetzung im Bild liegt — als **Anforderung** an die Wahl von
Referenzpunkt und Koeffizienten ist diese Lesart daher normativ leer: sie
schränkt keine Wahl ein. Die beiden Lesarten mit Gehalt sind `InverseIntegral`
und `ForwardIntegral`; siehe Modul-Docstring. -/
theorem chronogrid_kor_3_1_preimage_integral (a b : ℚ) (ha : a ≠ 0) (u : ℚ)
    (hu : u ∈ Set.range (classAMapping a b)) :
    ∃ t : ℤ, invClassAMappingQ a b u = (t : ℚ) := by
  obtain ⟨t, rfl⟩ := hu
  exact ⟨t, chronogrid_kor_3_1_left_inverse a b ha t⟩

/-!
## 3. Die beiden Exaktheitsbedingungen (explizite, unvergleichbare Hypothesen)
-/

/-- **Ganzzahligkeit der Hinrichtung.** Das Mapping bildet jeden Zeitwert der
Quelldomäne auf einen **ganzzahligen** Wert der Zieldomäne ab, ist also im Sinne
von CG-STD-2100 Kap. 4.6 eine Funktion ℤ∞ → ℤ∞.

Gebraucht wird diese Bedingung für die Rekonstruierbarkeitsbehauptung in ℤ∞: nur
wenn der Zwischenwert `M(t)` in ℤ∞_B überhaupt darstellbar ist, ist der Weg
ℤ∞_A → ℤ∞_B → ℤ∞_A geschlossen (`chronogrid_kor_3_1_roundtrip_int`).

Sie folgt **nicht** aus Def. 3.3 — Gegenbeispiel `a = 1/2`, `b = 0`, `t = 1`
(`chronogrid_kor_3_1_integrality_not_automatic`) — und wird deshalb nirgends
global unterstellt, sondern nur dort als Hypothese geführt, wo sie gebraucht
wird.

CG-STD-2100 v1.5 Kap. 4.6 bezeichnet **alle** Klasse-A-Mappings als Funktionen
ℤ∞ → ℤ∞ — also so, als wäre diese Bedingung immer erfüllt; nach Def. 3.3 gilt
sie jedoch nicht automatisch (`chronogrid_kor_3_1_integrality_not_automatic`).
Das Verhältnis beider Angaben ist normativ offen und wird durch diese
Formalisierung nicht aufgelöst.

Diese Bedingung betrifft die **Hin**richtung. Der Satz der Beweisskizze spricht
dagegen von der Rückabbildung; die Zuordnung ist eine Interpretation dieser
Formalisierung und kein Zitat (Begründung und Quellenlage im Modul-Docstring).
Sie ist unvergleichbar mit `InverseIntegral`
(`chronogrid_kor_3_1_forward_not_inverse`,
`chronogrid_kor_3_1_inverse_not_forward`).

Formuliert über ganz ℤ, nicht über einen Extent nach Def. 2.1 (nicht
modelliert). -/
def ForwardIntegral (a b : ℚ) : Prop := ∀ t : ℤ, ∃ u : ℤ, classAMapping a b t = (u : ℚ)

/-- **Ganzzahligkeit der Rückabbildung.** Die wörtliche Lesart des Satzes „die
Rückabbildung … liefert Ganzzahl-Ergebnisse": für jeden ganzzahligen Zielwert
`u ∈ ℤ∞_B` liegt `M⁻¹(u) = (u − b)/a` wieder in ℤ∞_A.

Das ist die einzige Lesart, unter der der Satz eine echte Anforderung **an die
Rückabbildung** ausdrückt; die Lesart „auf dem Bild" ist ohne Voraussetzung
erfüllt und damit normativ leer (`chronogrid_kor_3_1_preimage_integral`).

Unvergleichbar mit `ForwardIntegral`: keine der beiden Bedingungen folgt aus der
anderen (`chronogrid_kor_3_1_forward_not_inverse`,
`chronogrid_kor_3_1_inverse_not_forward`). Welche von beiden der Dokumentwortlaut
meint, ist damit nicht entschieden.

Formuliert über ganz ℤ, nicht über einen Extent nach Def. 2.1 (nicht
modelliert). -/
def InverseIntegral (a b : ℚ) : Prop :=
  ∀ u : ℤ, ∃ t : ℤ, invClassAMappingQ a b (u : ℚ) = (t : ℚ)

/-- Unter `ForwardIntegral` ist der volle Hin- und Rückweg
ℤ∞_A → ℤ∞_B → ℤ∞_A geschlossen: zu jedem Zeitwert `t` gibt es einen
ganzzahligen Zielwert `u`, und die Umkehrabbildung führt von `u` exakt auf `t`
zurück.

Gebraucht wird hier die Ganzzahligkeit der **Hin**richtung, nicht die der
Rückabbildung: das Rückrechnen selbst liefert auf dem Bild ohnehin das Urbild
(`chronogrid_kor_3_1_preimage_integral`); offen ist allein, ob der Zwischenwert
in ℤ∞_B darstellbar ist. `InverseIntegral` würde diese Aussage nicht stützen —
die beiden Bedingungen sind unvergleichbar.

Die Hypothese `hInt` wird im Beweis tatsächlich verwendet. -/
theorem chronogrid_kor_3_1_roundtrip_int (a b : ℚ) (ha : a ≠ 0)
    (hInt : ForwardIntegral a b) (t : ℤ) :
    ∃ u : ℤ, classAMapping a b t = (u : ℚ) ∧
      invClassAMappingQ a b (u : ℚ) = (t : ℚ) := by
  obtain ⟨u, hu⟩ := hInt t
  refine ⟨u, hu, ?_⟩
  rw [← hu]
  exact chronogrid_kor_3_1_left_inverse a b ha t

/-- Gegenbeispiel: `ForwardIntegral` folgt **nicht** aus Def. 3.3. Für
`a = 1/2`, `b = 0` ist M(1) = 1/2 ∉ ℤ∞. Damit ist belegt, dass die Bedingung
eine echte Zusatzannahme ist und nicht stillschweigend weggelassen werden
darf. -/
theorem chronogrid_kor_3_1_integrality_not_automatic :
    ¬ ForwardIntegral (1 / 2) 0 := by
  intro h
  obtain ⟨u, hu⟩ := h 1
  simp only [classAMapping] at hu
  have h2 : (2 * u : ℤ) = (1 : ℤ) := by
    have : ((2 * u : ℤ) : ℚ) = ((1 : ℤ) : ℚ) := by push_cast; push_cast at hu; linarith
    exact_mod_cast this
  omega

/-- **Unvergleichbarkeit, Richtung 1:** `ForwardIntegral` impliziert
`InverseIntegral` nicht. Zeuge ist `a = 2`, `b = 0`: die Hinrichtung
`t ↦ 2t` ist ganzzahlig, die Rückabbildung `u ↦ u/2` ist es für `u = 1`
nicht. -/
theorem chronogrid_kor_3_1_forward_not_inverse :
    ForwardIntegral 2 0 ∧ ¬ InverseIntegral 2 0 := by
  constructor
  · intro t
    refine ⟨2 * t, ?_⟩
    simp only [classAMapping]
    push_cast
    ring
  · intro h
    obtain ⟨t, ht⟩ := h 1
    norm_num [invClassAMappingQ, classAMappingQ] at ht
    have h2 : (2 * t : ℤ) = (1 : ℤ) := by
      have hq : ((2 * t : ℤ) : ℚ) = ((1 : ℤ) : ℚ) := by push_cast; linarith
      exact_mod_cast hq
    omega

/-- **Unvergleichbarkeit, Richtung 2:** `InverseIntegral` impliziert
`ForwardIntegral` nicht. Zeuge ist `a = 1/2`, `b = 0`: die Rückabbildung
`u ↦ 2u` ist ganzzahlig, die Hinrichtung `t ↦ t/2` ist es für `t = 1` nicht.

Zusammen mit `chronogrid_kor_3_1_forward_not_inverse` folgt: die beiden Lesarten
der Exaktheitsbedingung sind unvergleichbar. -/
theorem chronogrid_kor_3_1_inverse_not_forward :
    InverseIntegral (1 / 2) 0 ∧ ¬ ForwardIntegral (1 / 2) 0 := by
  refine ⟨?_, chronogrid_kor_3_1_integrality_not_automatic⟩
  intro u
  refine ⟨2 * u, ?_⟩
  rw [invClassAMappingQ_eq (1 / 2) 0 (by norm_num)]
  push_cast
  ring

/-!
## 4. Abgrenzung: Bijektivität auf ℚ, nicht auf ℤ∞
-/

/-- Auf der ℚ-Ebene ist ein Klasse-A-Mapping mit `a ≠ 0` bijektiv — mit
`invClassAMappingQ` als beidseitiger Umkehrung.

Diese Aussage steht bewusst über ℚ und **nicht** über ℤ∞: auf ℤ∞ gilt sie
nicht (siehe `chronogrid_kor_3_1_not_surjective_onto_int`), und das Korollar
behauptet sie dort auch nicht. -/
theorem chronogrid_kor_3_1_bijective_on_Q (a b : ℚ) (ha : a ≠ 0) :
    Function.Bijective (classAMappingQ a b) :=
  Function.bijective_iff_has_inverse.mpr
    ⟨invClassAMappingQ a b,
      invClassAMappingQ_leftInverse a b ha,
      invClassAMappingQ_rightInverse a b ha⟩

/-- Die Hinrichtung ist auf ℤ∞ im Allgemeinen **nicht** surjektiv: für `a = 2`,
`b = 0` wird der Zielwert 1 von keinem Zeitwert getroffen. Das belegt den Satz
„Surjektivität auf ganz ℤ∞ ist nicht erforderlich" aus dem Korollar von der
Gegenseite: sie ist nicht nur entbehrlich, sie gilt schlicht nicht. -/
theorem chronogrid_kor_3_1_not_surjective_onto_int :
    ¬ ∃ t : ℤ, classAMapping 2 0 t = (1 : ℚ) := by
  rintro ⟨t, ht⟩
  simp only [classAMapping] at ht
  have h2 : (2 * t : ℤ) = (1 : ℤ) := by
    have : ((2 * t : ℤ) : ℚ) = ((1 : ℤ) : ℚ) := by push_cast; linarith
    exact_mod_cast this
  omega

/-!
## Axiom-Verifikation (Nachweis: kein `sorry`, alle Beweise vollständig)
-/

#print axioms invClassAMappingQ_eq
#print axioms chronogrid_kor_3_1_inverse_isClassA
#print axioms chronogrid_kor_3_1_isClassA_needs_a_ne_zero
#print axioms chronogrid_kor_3_1_injective
#print axioms chronogrid_kor_3_1_no_collision
#print axioms chronogrid_kor_3_1_a_ne_zero_necessary
#print axioms invClassAMappingQ_leftInverse
#print axioms invClassAMappingQ_rightInverse
#print axioms chronogrid_kor_3_1_left_inverse
#print axioms chronogrid_kor_3_1_preimage_integral
#print axioms chronogrid_kor_3_1_roundtrip_int
#print axioms chronogrid_kor_3_1_integrality_not_automatic
#print axioms chronogrid_kor_3_1_forward_not_inverse
#print axioms chronogrid_kor_3_1_inverse_not_forward
#print axioms chronogrid_kor_3_1_bijective_on_Q
#print axioms chronogrid_kor_3_1_not_surjective_onto_int

end ChronoGrid
