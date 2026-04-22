/**
 * cg-storage/src/repository-factory.ts
 * Repository-Factory — CG-APP-0700 §9
 *
 * Wählt die Repository-Implementierung basierend auf STORAGE-Umgebungsvariable:
 *   STORAGE=memory   → In-Memory (Standard für Tests, kein PostgreSQL nötig)
 *   STORAGE=postgres → PostgreSQL (Produktion, CG-STD-4100 Level 2/3)
 *
 * Alle Repositories implementieren dieselben Interfaces — Code der sie
 * verwendet muss nicht wissen, welche Implementierung aktiv ist.
 */

import pg from 'pg';
import type {
  ITimepointRepository,
  IDomainRepository,
  IManifestRepository,
  IRelationRepository,
} from './repository.js';
import {
  InMemoryTimepointRepository,
  InMemoryDomainRepository,
  InMemoryManifestRepository,
  InMemoryRelationRepository,
} from './repository.js';
import {
  PgTimepointRepository,
  PgDomainRepository,
  PgManifestRepository,
  PgRelationRepository,
  PgSegmentRepository,
} from './pg-repository.js';
import type { ISegmentRepository } from './repository.js';
import { InMemorySegmentRepository } from './repository.js';

export type StorageBackend = 'memory' | 'postgres';

export interface RepositoryBundle {
  timepoints: ITimepointRepository;
  domains:    IDomainRepository;
  manifests:  IManifestRepository;
  relations:  IRelationRepository;
  segments:   ISegmentRepository;
  backend:    StorageBackend;
}

/**
 * Erstellt alle Repositories für das konfigurierte Backend.
 *
 * @param pool  PostgreSQL Pool (nur benötigt wenn backend='postgres')
 * @param backend  'memory' | 'postgres' (Standard: STORAGE-Env oder 'memory')
 */
export function createRepositories(
  pool?: pg.Pool,
  backend?: StorageBackend,
): RepositoryBundle {
  const resolvedBackend: StorageBackend =
    backend ??
    (process.env['STORAGE'] === 'postgres' ? 'postgres' : 'memory');

  if (resolvedBackend === 'postgres') {
    if (!pool) {
      throw new Error(
        'createRepositories: PostgreSQL Pool wird benötigt wenn STORAGE=postgres',
      );
    }
    return {
      timepoints: new PgTimepointRepository(pool),
      domains:    new PgDomainRepository(pool),
      manifests:  new PgManifestRepository(pool),
      relations:  new PgRelationRepository(pool),
      segments:   new PgSegmentRepository(pool),
      backend:    'postgres',
    };
  }

  // Default: In-Memory (Tests, lokale Entwicklung ohne PostgreSQL)
  return {
    timepoints: new InMemoryTimepointRepository(),
    domains:    new InMemoryDomainRepository(),
    manifests:  new InMemoryManifestRepository(),
    relations:  new InMemoryRelationRepository(),
    segments:   new InMemorySegmentRepository(),
    backend:    'memory',
  };
}
