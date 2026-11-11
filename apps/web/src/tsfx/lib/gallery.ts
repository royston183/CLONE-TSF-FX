// src/lib/gallery.ts
/** The UI Gallery is for developers: on in development, or when no SAP service is configured (only sample data). */
export const galleryEnabled = (nodeEnv: string | undefined, hasSapService: boolean): boolean => nodeEnv !== 'production' || !hasSapService;
