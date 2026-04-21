/**
 * cg-storage/src/repository.ts
 * Repository-Layer — CG-STD-4100 v0.5 Kap. 3
 * Abstrahiert alle DB-Operationen. Insert-only (I-D1).
 * Produktionsimplementierung: PostgreSQL mit node-postgres (pg).
 * Diese Datei: typsicheres Interface + In-Memory-Implementierung für Tests.
 */
import { createHash } from 'node:crypto';
import { Errors } from '../../cg-types/src/errors.ts';
// ── In-Memory Implementierung (Tests / Sprint 3) ──────────────────────────────
export class InMemoryTimepointRepository {
    store = new Map();
    async insert(row) {
        // Insert-only: kein Überschreiben (I-D1)
        if (this.store.has(row.machine_id)) {
            throw Errors.RegistryError.Conflict(row.machine_id);
        }
        // absolute_value darf kein Float sein (normativ)
        if (typeof row.absolute_value !== 'bigint') {
            throw Errors.InvariantError.I_R3({ reason: 'absolute_value muss BigInt sein, kein Float' });
        }
        this.store.set(row.machine_id, Object.freeze({ ...row }));
    }
    async findByMachineId(machineId) {
        return this.store.get(machineId) ?? null;
    }
    async findByDomainAndRange(domainId, min, max) {
        return [...this.store.values()].filter(r => r.domain_id === domainId &&
            r.absolute_value >= min &&
            r.absolute_value <= max);
    }
    get count() { return this.store.size; }
}
export class InMemoryDomainRepository {
    store = new Map();
    async insert(domain, publishedAt, publishedBy) {
        const id = `${domain.name}/v${domain.version}`;
        if (this.store.has(id)) {
            throw Errors.RegistryError.Conflict(id);
        }
        // Integritäts-Hash über CTDDL-JSON
        const ctddlJson = JSON.stringify(domain);
        createHash('sha256').update(ctddlJson).digest('hex');
        this.store.set(id, { domain: Object.freeze({ ...domain }), publishedAt, publishedBy });
    }
    async findById(domainId) {
        return this.store.get(domainId)?.domain ?? null;
    }
    async list() {
        return [...this.store.values()].map(v => v.domain);
    }
    get count() { return this.store.size; }
}
export class InMemoryManifestRepository {
    store = new Map();
    async insert(row) {
        if (this.store.has(row.cgfi)) {
            throw Errors.CGFSError.NamespaceConflict(row.cgfi, row.type_id);
        }
        this.store.set(row.cgfi, Object.freeze({ ...row }));
    }
    async findByCGFI(cgfi) {
        return this.store.get(cgfi) ?? null;
    }
    async softDelete(cgfi, deletedAt, reason) {
        const existing = this.store.get(cgfi);
        if (!existing)
            throw Errors.CGFSError.ManifestMissing();
        if (existing.deleted_at) {
            throw Errors.CGFSError.TombstoneExists(cgfi);
        }
        // Nur deleted_at und deleted_reason setzen — alle anderen Felder bleiben (I-D1)
        this.store.set(cgfi, Object.freeze({ ...existing, deleted_at: deletedAt, deleted_reason: reason }));
    }
    async getVersionChain(cgfi) {
        const chain = [];
        let current = this.store.get(cgfi);
        while (current) {
            chain.push(current);
            current = current.prev_version ? this.store.get(current.prev_version) : undefined;
        }
        return chain;
    }
    get count() { return this.store.size; }
    get activeCount() {
        return [...this.store.values()].filter(r => !r.deleted_at).length;
    }
}
export class InMemoryRelationRepository {
    store = new Map();
    async insert(row) {
        // relation_id = SHA-256(a || b || type) — deterministisch
        const expected = createHash('sha256')
            .update(row.machine_id_a + row.machine_id_b + row.relation_type)
            .digest('hex');
        if (row.relation_id !== expected) {
            throw Errors.InvariantError.I_R3({ reason: `relation_id muss SHA-256(a||b||type) sein` });
        }
        this.store.set(row.relation_id, Object.freeze({ ...row }));
    }
    async findByPair(machineIdA, machineIdB) {
        return [...this.store.values()].filter(r => r.machine_id_a === machineIdA && r.machine_id_b === machineIdB);
    }
}
// ── Hilfsfunktion: Domain-ID aus Name + Version ────────────────────────────────
export function makeDomainId(name, version) {
    return `${name}/v${version}`;
}
// ── Hilfsfunktion: RelationRow erstellen ──────────────────────────────────────
export function makeRelationRow(machineIdA, machineIdB, relationType, computedAt) {
    const relation_id = createHash('sha256')
        .update(machineIdA + machineIdB + relationType)
        .digest('hex');
    return { relation_id, machine_id_a: machineIdA, machine_id_b: machineIdB, relation_type: relationType, computed_at: computedAt };
}
