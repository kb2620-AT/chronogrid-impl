---
name: cg-status
description: Zeigt den aktuellen ChronoGrid-Projektstatus - Git-Status, letzte Commits, ungepushte Commits und offene Änderungen. Nur lesend, committet oder pusht nichts.
disable-model-invocation: true
allowed-tools: Bash(git status:*) Bash(git log:*) Bash(git diff:*)
---

## Git-Status (unstaged/uncommitted Änderungen)
!`git status`

## Letzte 10 Commits
!`git log --oneline -10`

## Lokale Commits, die noch NICHT gepusht sind
!`git log origin/main..HEAD --oneline 2>&1 || echo "Kein Vergleich mit origin/main möglich (kein Remote-Tracking oder anderer Branchname)."`

## Zusammenfassung der offenen Änderungen
!`git diff --stat`

## Deine Aufgabe

Fasse den obigen Status kompakt und auf Deutsch zusammen, in dieser Reihenfolge:

1. **Ungepushte Commits**: Wie viele lokale Commits warten noch auf den Push? Liste sie kurz mit Hash und Nachricht.
2. **Offene Änderungen**: Gibt es unstaged oder uncommitted Änderungen im Arbeitsverzeichnis? Welche Dateien betrifft das?
3. **Empfehlung**: Gib NUR eine Einschätzung ab, ob laut ChronoGrid-Regel (kein Push ohne vollständige Freigabe, insbesondere: erst pushen wenn alle offenen Pakete inkl. zugehöriger Tests abgeschlossen sind) ein Push aktuell sinnvoll wäre - triff aber selbst KEINE Entscheidung und führe KEINEN Push oder Commit aus. Das bleibt immer Kurts Entscheidung.

Halte die Antwort kurz und klar strukturiert. Keine Spekulation über Inhalte, die nicht im Status/Log sichtbar sind.
