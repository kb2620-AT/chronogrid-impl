/**
 * cg-storage/src/repository-factory.ts
 * Repository-Factory — CG-APP-0700 §9
 *
 * SPRINT 7: Gibt Repository-Interfaces zurück (nicht konkrete Klassen).
 * APIContext in handlers.ts verwendet nur noch Interfaces → PostgreSQL vollständig aktiviert.
 */

import pg from 'pg';
import type {
  ITimepointRepository, IDomainRepository,
  IManifestRepository, IRelationRepository, ISegmentRepository,
} from './repository.js';
import {
  InMemoryTimepointRepository, InMemoryDomainRepository,
  InMemoryManifestRepository, InMemoryRelationRepository, InMemorySegmentRepository,
} from './repository.js';
import {
  PgTimepointRepository, PgDomainRepository,
  PgManifestRepository, PgRelationRepository, PgSegmentRepository,
} from './pg-repository.js';

export type StorageBackend = 'memory' | 'postgres';

export interface RepositoryBundle {
  timepoints: ITimepointRepository;
  domains:    IDomainRepository;
  manifests:  IManifestRepository;
  relations:  IRelationRepository;
  segments:   ISegmentRepository;
  backend:    StorageBackend;
}

export function createRepositories(pool?: pg.Pool, backend?: StorageBackend): RepositoryBundle {
  const b: StorageBackend = backend ?? (process.env['STORAGE'] === 'postgres' ? 'postgres' : 'memory');

  if (b === 'postgres') {
    if (!pool) throw new Error('PostgreSQL-Pool erforderlich für STORAGE=postgres');
    return {
      timepoints: new PgTimepointRepository(pool),
      domains:    new PgDomainRepository(pool),
      manifests:  new PgManifestRepository(pool),
      relations:  new PgRelationRepository(pool),
      segments:   new PgSegmentRepository(pool),
      backend:    'postgres',
    };
  }

  return {
    timepoints: new InMemoryTimepointRepository(),
    domains:    new InMemoryDomainRepository(),
    manifests:  new InMemoryManifestRepository(),
    relations:  new InMemoryRelationRepository(),
    segments:   new InMemorySegmentRepository(),
    backend:    'memory',
  };
}
