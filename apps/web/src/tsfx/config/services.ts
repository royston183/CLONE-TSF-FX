import list from './services.json';

/**
 * SAP OData V4 services the applications use, listed in `services.json` (FS Sprint reads the same file). Each is reached
 * on the SAP relay (SAP_RELAY_URL); `path` is its service root on the SAP host.
 */
export interface ServiceDef { key: string; title: string; binding: string; path: string }

export const SERVICES: ServiceDef[] = list;
