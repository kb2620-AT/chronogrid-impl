// Repository-Interfaces und In-Memory-Implementierungen
export * from './repository.js';
// PostgreSQL Connection Pool
export * from './pg-client.js';
// PostgreSQL Repository-Implementierungen (ISegmentRepository kommt aus repository.js)
export {
  PgTimepointRepository,
  PgDomainRepository,
  PgManifestRepository,
  PgRelationRepository,
  PgSegmentRepository,
  createPgRepositories,
} from './pg-repository.js';
export type { PgRepositoryBundle } from './pg-repository.js';
// Factory: wählt Memory oder PostgreSQL basierend auf STORAGE-Env
export * from './repository-factory.js';
