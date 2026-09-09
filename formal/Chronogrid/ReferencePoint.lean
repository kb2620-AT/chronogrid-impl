import Chronogrid.Basic

/-!
# Theorem 3.3 — Referenzpunkt-Konsistenz (I-M3)

Formalisierung von Theorem 3.3 aus CG-STD-0000 v0.9, Kap. 3.2 — **ausschließlich
für den linearen Fall nach Definition 3.3**.

Quelle (Originalwortlaut, Def. 3.3):
„M_{A→B}(t) = a·t + b, mit a = p/q (p, q ∈ ℤ∞, q ≠ 0, a ≠ 0) und b ∈ ℚ. Der
Referenzpunkt R = (s, r) bestimmt b = r − a·s; b ist im Allgemeinen rational und
wird exakt als Bruch gespeichert."

Quelle (Originalwortlaut, Th. 3.3):
„Sei M_{A→B} ein Klasse-A-Mapping mit Referenzpunkt R = (s, r). Dann gilt:
M_{A→B}(s) = r exakt — ohne Rundungsfehler."

Beweisskizze im Dokument (linearer Teil): „Für lineare Mappings: b = r − as,
daher M(s) = as + r − as = r. Exakt in ℤ∞-Arithmetik (keine
Gleitkommaungenauigkeit)."

Baut auf `classAMapping` (Basic.lean, Def. 3.3 / Th. 3.1) auf; Basic.lean,
Mapping.lean und Hierarchy.lean bleiben unverändert.

## Geltungsbereich: nur Definition 3.3 (linear)

Diese Datei deckt **ausschließlich** den linearen Fall nach Definition 3.3 ab.
Der piecewise-lineare Fall nach **Definition 3.4 ist ausdrücklich NICHT Teil
dieser Formalisierung** — analog zur bereits im Dokument etablierten Abgrenzung
in Kap. 5.6 („piecewise-lineare … Mappings sind nicht Teil dieses
Pilotumfangs").

Begründung, über den Pilotumfang hinaus: eine Vorprüfung hat eine **ungeklärte
normative Lücke** zwischen Definition 3.4 und der Totalitätsbehauptung in der
Beweisskizze zu Theorem 3.1 aufgedeckt — die Verknüpfung zwischen Segmenten und
Extent ist nicht festgelegt. Solange offen ist, ob ein piecewise-lineares
Mapping auf seinem gesamten Extent definiert sein muss (und wie Segmentgrenzen
lückenlos anschließen), ist für den piecewise-linearen Fall weder die
Funktionseigenschaft noch die Referenzpunkt-Aussage sauber formalisierbar. Diese
Lücke ist zuerst **normativ** zu klären; erst danach ist eine Mechanisierung von
Def. 3.4 sinnvoll. Bis dahin wird hier keine Aussage über piecewise-lineare
Mappings getroffen und auch keine implizit mit abgedeckt.

## Typwahl: `s : ℤ`, `r : ℚ`

Der Referenzpunkt R = (s, r) besteht aus einem Zeitwert `s` in der Quelldomäne A
und dem zugehörigen Wert `r` in der Zieldomäne B. Gewählt wird `s : ℤ` und
`r : ℚ`:

* `s : ℤ` folgt der **bestehenden Signatur** `classAMapping : ℚ → ℚ → ℤ → ℚ` aus
  Basic.lean (Zeitwert nach Def. 1.1, also ℤ∞). Damit bleibt `M(s)` ein Aufruf
  von `classAMapping` selbst — die Aussage wird über genau die Funktion
  bewiesen, die Theorem 3.1 formalisiert, ohne Signaturänderung und ohne
  Umweg über eine zweite Definition.
* `r : ℚ` folgt dem Wertebereich aus Def. 3.3 („b ist im Allgemeinen rational");
  eine Einschränkung von `r` auf ℤ wäre echt schwächer und würde den vom
  Dokument ausdrücklich vorgesehenen Fall eines rationalen `b` ausschließen.

Die ℚ→ℚ-Variante `classAMappingQ` aus Mapping.lean wird hier bewusst **nicht**
verwendet: Theorem 3.3 braucht keine Komposition, und der Referenzpunkt-Zeitwert
`s` ist nach Def. 1.1 ganzzahlig. Für die ℚ-Fortsetzung existiert bereits die
Brücke `classAMappingQ_int_cast` (Mapping.lean); eine ℚ-Fassung dieser Datei
ließe sich daraus ohne neue mathematische Substanz gewinnen.

## „Exakt — ohne Rundungsfehler": was das hier heißt

Die Aussage unten ist eine **Gleichheit in ℚ**, nicht eine Fehlerschranke.
Rundungsfreiheit ist in dieser Formalisierung eine Eigenschaft des gewählten
Trägertyps: ℚ ist exakte Bruchrechnung, ein Gleitkommamodell existiert hier gar
nicht. Bewiesen wird also „M(s) = r in exakter Arithmetik" — **nicht**, dass
eine konkrete Implementierung Gleitkomma vermeidet. Dass die Implementierung
tatsächlich exakt rechnet (Bruchdarstellung statt `double`), ist eine Aussage
über den Code und hier weder modelliert noch behauptet.

Ebenfalls bewusst **nicht** in die Definition kodiert ist die Nebenbedingung
`a ≠ 0` aus Def. 3.3 — gleiche Linie wie in Basic.lean und Mapping.lean. Die
Aussage gilt für alle `a : ℚ` und damit erst recht für Klasse-A-Mappings mit
`a ≠ 0`; die Voraussetzung wird nicht gebraucht und wird deshalb nicht als
unbenutzte Hypothese mitgeführt.
-/

namespace ChronoGrid

/-- Der aus dem Referenzpunkt R = (s, r) **bestimmte** Achsenabschnitt
`b = r − a·s` (Def. 3.3, CG-STD-0000 v0.9, Kap. 3.2).

Bewusst als Funktion des Referenzpunkts definiert und **nicht** als freier
Parameter: das Dokument führt `b` nicht als unabhängige Größe, sondern als vom
Referenzpunkt abgeleiteten Wert („Der Referenzpunkt R = (s, r) bestimmt
b = r − a·s"). Dass diese Ableitung eindeutig ist, wird unten in
`chronogrid_th_3_3_b_determined` mitbewiesen. -/
def bFromRef (a : ℚ) (s : ℤ) (r : ℚ) : ℚ := r - a * (s : ℚ)

/-- **Theorem 3.3 — Referenzpunkt-Konsistenz** (I-M3; CG-STD-0000 v0.9,
Kap. 3.2, linearer Fall nach Def. 3.3).

„Sei M_{A→B} ein Klasse-A-Mapping mit Referenzpunkt R = (s, r). Dann gilt:
M_{A→B}(s) = r exakt — ohne Rundungsfehler."

Formalisiert als: das Klasse-A-Mapping mit Steigung `a` und dem aus R
abgeleiteten Achsenabschnitt `bFromRef a s r` bildet den Referenzzeitpunkt `s`
auf genau `r` ab. Die Gleichheit ist eine Gleichheit in ℚ (exakte
Bruchrechnung); zur Reichweite von „ohne Rundungsfehler" siehe den
Modul-Docstring.

Geltungsbereich: **nur Def. 3.3 (linear)**. Piecewise-lineare Mappings nach
Def. 3.4 sind nicht Teil dieser Aussage (Begründung im Modul-Docstring).

Beweis: `M(s) = a·s + (r − a·s) = r`, reine Ringrechnung in ℚ. -/
theorem chronogrid_th_3_3_reference_point_consistency (a : ℚ) (s : ℤ) (r : ℚ) :
    classAMapping a (bFromRef a s r) s = r := by
  simp only [classAMapping, bFromRef]
  ring

/-- Zusatz zu Def. 3.3: der Referenzpunkt **bestimmt** `b` — es gibt genau ein
`b : ℚ`, für das das Mapping `s` auf `r` abbildet, nämlich `bFromRef a s r`.

Das ist die Eindeutigkeitshälfte der Formulierung „Der Referenzpunkt R = (s, r)
bestimmt b = r − a·s" (Def. 3.3) und gehört streng genommen zu Def. 3.3, nicht
zum Wortlaut von Theorem 3.3; es ist hier aufgenommen, weil Theorem 3.3 sonst
auch von einem beliebig gewählten `b` erfüllbar scheinen könnte, das zufällig
`M(s) = r` liefert. Die Eindeutigkeit gilt ohne jede Voraussetzung an `a`
(insbesondere auch für `a = 0`), da `b` linear und mit Koeffizient 1 in
`M(s)` eingeht. -/
theorem chronogrid_th_3_3_b_determined (a : ℚ) (s : ℤ) (r : ℚ) :
    ∃! b : ℚ, classAMapping a b s = r := by
  refine ⟨bFromRef a s r, chronogrid_th_3_3_reference_point_consistency a s r, ?_⟩
  intro b hb
  simp only [classAMapping] at hb
  simp only [bFromRef]
  linarith

/-!
## Axiom-Verifikation (Nachweis: kein `sorry`, alle Beweise vollständig)
-/

#print axioms chronogrid_th_3_3_reference_point_consistency
#print axioms chronogrid_th_3_3_b_determined

end ChronoGrid
