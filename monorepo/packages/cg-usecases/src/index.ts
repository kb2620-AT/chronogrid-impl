/**
 * cg-usecases — CG-APP-0600 v0.5 Use Cases UC1–UC5
 * Normative Referenzimplementierungen für ChronoGrid-Anwendungsfälle
 */

// UC1: ATC/ACARS Aviation
export * from './uc1.js';

// UC2: Notarieller Akt Legal-AT
export * from './uc2.js';

// UC3: IEC 61850 Energiemessung (Shelly Pro 3EM)
export * from './uc3.js';

// UC4: Cosmic Domain Astrophysik
export * from './uc4.js';

// UC5: QKD Photon-Ereignis (I-QKD-1)
export * from './uc5.js';

/** Alle Use-Case-Domains als Array */
export { DOMAIN_AVIATION } from './uc1.js';
export { DOMAIN_LEGAL_AT } from './uc2.js';
export { DOMAIN_IEC61850 } from './uc3.js';
export { DOMAIN_QKD_PHOTON } from './uc5.js';
// UC4 verwendet Cosmic v1.1 (Built-in aus cg-engine)

export const UC_DOMAINS = [
  'Aviation@1.0',
  'LegalAT@1.0',
  'IEC61850@1.0',
  'Cosmic@1.1',    // Built-in
  'QKDPhoton@1.0',
] as const;

export const UC_DESCRIPTIONS = {
  UC1: 'ATC/ACARS Flugereignis — Aviation v1.0, ms-Granularität',
  UC2: 'Notarieller Akt — LegalAT v1.0, I-D1+I-S1 Unveränderlichkeit',
  UC3: 'Energiemessung Shelly Pro 3EM — IEC61850 v1.0, ns-Granularität',
  UC4: 'Cosmic/Pulsar — Cosmic v1.1, scientific_dependency (PSR B1919+21)',
  UC5: 'QKD Photon — QKDPhoton v1.0, I-QKD-1 Eindeutigkeit (CG-STD-6100 §7.4)',
};
