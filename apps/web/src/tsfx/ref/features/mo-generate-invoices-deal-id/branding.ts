/**
 * The company branding of the generated documents. One place: the logo asset (bundled with the app, so no file
 * path of any PC is used) and the crop that trims the white margin of the supplied image. The legal entity names
 * printed on a document (seller, buyer) come from the transaction and are not branding.
 */
import logoUrl from '@tsfx/assets/branding/ofi-logo.jpg?url'

export const BRAND = {
  name: 'ofi',
  logoUrl,
  /** The supplied image (701 × 501 px, JPEG) with the artwork's bounding box in pixels, to trim the margin without distortion. */
  logo: { width: 701, height: 501, crop: { x: 125, y: 55, w: 410, h: 385 } },
} as const

export type Logo = { bytes: Uint8Array; width: number; height: number; crop: { x: number; y: number; w: number; h: number } }

let cached: Promise<Logo> | null = null

/** Loads the logo once (the bundled file, fetched from the app's own origin). */
export function loadLogo(): Promise<Logo> {
  cached ??= fetch(BRAND.logoUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`The ofi logo could not be loaded (${r.status}).`)
      return r.arrayBuffer()
    })
    .then((buf) => ({ bytes: new Uint8Array(buf), width: BRAND.logo.width, height: BRAND.logo.height, crop: BRAND.logo.crop }))
    .catch((e) => {
      cached = null
      throw e
    })
  return cached
}
