#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════╗
║  CG-HASH — ChronoGrid Dokumenten-Hashprotokoll                ║
║  Beweissicherung der zeitlichen Priorität                      ║
║  Version 1.0  ·  April 2026  ·  ChronoGrid Systems            ║
╚══════════════════════════════════════════════════════════════════╝

Erzeugt ein kryptographisches Hashprotokoll über alle ChronoGrid-
Dokumente in einem Verzeichnis. Zweck: forensischer Nachweis,
dass diese Dokumente zu einem bestimmten Zeitpunkt in exakt
diesem Zustand existiert haben.

Verwendung:
  Doppelklick auf HASH-PROTOKOLL.bat
  — oder —
  python cg-hash.py /pfad/zum/ordner

Ausgabe:
  CG-Hashprotokoll_YYYY-MM-DD_HHMMSS.txt

Aufbewahrungsempfehlung:
  - Protokolldatei ausdrucken und unterschreiben
  - Kopie per E-Mail an sich selbst senden (Zeitstempel des Mailservers)
  - Optional: bei einem Notar hinterlegen oder an einen Anwalt senden
"""

import argparse
import hashlib
import os
import sys
from datetime import datetime


def hash_file(filepath):
    """Berechnet SHA-256 Hash einer Datei."""
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            sha256.update(chunk)
    return sha256.hexdigest()


def generate_protocol(doc_dir):
    """Erzeugt das Hashprotokoll."""

    # Sammle alle relevanten Dateien
    files = []
    for fn in sorted(os.listdir(doc_dir)):
        if fn.endswith('.docx') and not fn.startswith('~'):
            filepath = os.path.join(doc_dir, fn)
            files.append((fn, filepath))

    if not files:
        print('Keine .docx-Dateien gefunden.')
        sys.exit(1)

    # Zeitstempel
    now = datetime.now()
    timestamp = now.strftime('%Y-%m-%d %H:%M:%S')
    timestamp_file = now.strftime('%Y-%m-%d_%H%M%S')

    # Hashes berechnen
    hashes = []
    for fn, filepath in files:
        file_hash = hash_file(filepath)
        file_size = os.path.getsize(filepath)
        hashes.append((fn, file_hash, file_size))

    # Gesamthash über alle Einzelhashes (Reihenfolge: alphabetisch nach Dateiname)
    combined = hashlib.sha256()
    for fn, file_hash, _ in hashes:
        combined.update(f'{fn}:{file_hash}\n'.encode('utf-8'))
    total_hash = combined.hexdigest()

    # Protokoll erstellen
    lines = []
    lines.append('=' * 78)
    lines.append('  CHRONOGRID DOKUMENTEN-HASHPROTOKOLL')
    lines.append('  Beweissicherung der zeitlichen Priorität')
    lines.append('=' * 78)
    lines.append('')
    lines.append(f'  Erstellt:        {timestamp}')
    lines.append(f'  Verzeichnis:     {os.path.abspath(doc_dir)}')
    lines.append(f'  Anzahl Dateien:  {len(hashes)}')
    lines.append(f'  Rechner:         {os.environ.get("COMPUTERNAME", os.environ.get("HOSTNAME", "unbekannt"))}')
    lines.append(f'  Benutzer:        {os.environ.get("USERNAME", os.environ.get("USER", "unbekannt"))}')
    lines.append('')
    lines.append('=' * 78)
    lines.append('  GESAMTHASH (SHA-256 über alle Einzelhashes)')
    lines.append('=' * 78)
    lines.append('')
    lines.append(f'  {total_hash}')
    lines.append('')
    lines.append('  Dieser Hash ändert sich, wenn auch nur ein einziges Byte')
    lines.append('  in irgendeinem der unten gelisteten Dokumente geändert wird.')
    lines.append('')
    lines.append('=' * 78)
    lines.append('  EINZELHASHES')
    lines.append('=' * 78)
    lines.append('')

    # Tabelle
    max_fn = max(len(fn) for fn, _, _ in hashes)
    header = f'  {"Datei":<{max_fn}}   {"SHA-256":<64}   {"Größe":>10}'
    lines.append(header)
    lines.append(f'  {"-" * max_fn}   {"-" * 64}   {"-" * 10}')
    for fn, file_hash, file_size in hashes:
        size_str = f'{file_size:>10,}'.replace(',', '.')
        lines.append(f'  {fn:<{max_fn}}   {file_hash}   {size_str}')

    lines.append('')
    lines.append('=' * 78)
    lines.append('  VERIFIZIERUNGSANLEITUNG')
    lines.append('=' * 78)
    lines.append('')
    lines.append('  Um die Integrität der Dokumente zu einem späteren Zeitpunkt')
    lines.append('  zu verifizieren, dieses Skript erneut ausführen und den')
    lines.append('  GESAMTHASH mit dem oben dokumentierten Wert vergleichen.')
    lines.append('')
    lines.append('  Stimmen die Hashes überein, ist kein Dokument verändert worden.')
    lines.append('  Weicht auch nur ein Hash ab, wurde mindestens ein Dokument geändert.')
    lines.append('')
    lines.append('=' * 78)
    lines.append('  AUFBEWAHRUNGSEMPFEHLUNG')
    lines.append('=' * 78)
    lines.append('')
    lines.append('  1. Diese Datei ausdrucken, unterschreiben und datieren')
    lines.append('  2. Kopie per E-Mail an sich selbst senden')
    lines.append('     (der Mailserver-Zeitstempel dient als unabhängiger Beweis)')
    lines.append('  3. Optional: bei einem Notar oder Anwalt hinterlegen')
    lines.append('  4. Digitale Kopie an einem unveränderbaren Ort speichern')
    lines.append('     (z.B. verschlüsselter USB-Stick im Safe)')
    lines.append('')
    lines.append('=' * 78)
    lines.append('')
    lines.append('  _______________________________     _______________')
    lines.append('  Unterschrift                        Datum')
    lines.append('')
    lines.append(f'  ChronoGrid Systems · {timestamp}')
    lines.append('')

    protocol_text = '\n'.join(lines)

    # Ausgabedatei
    output_name = f'CG-Hashprotokoll_{timestamp_file}.txt'
    output_path = os.path.join(doc_dir, output_name)

    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(protocol_text)
        print(f'\n  Protokoll geschrieben: {output_path}')
    except Exception:
        # Fallback: Temp-Verzeichnis
        output_path = os.path.join(os.environ.get('TEMP', '/tmp'), output_name)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(protocol_text)
        print(f'\n  Protokoll geschrieben: {output_path}')

    # Auf Bildschirm ausgeben
    print(protocol_text)

    return output_path


def main():
    parser = argparse.ArgumentParser(
        description='CG-HASH — ChronoGrid Dokumenten-Hashprotokoll'
    )
    parser.add_argument('directory', nargs='?', default='.',
                        help='Verzeichnis mit CG-*.docx Dateien (Standard: aktuell)')
    args = parser.parse_args()

    if not os.path.isdir(args.directory):
        print(f'Fehler: {args.directory} ist kein Verzeichnis', file=sys.stderr)
        sys.exit(1)

    generate_protocol(args.directory)


if __name__ == '__main__':
    main()
