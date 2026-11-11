// Types of the TSF_FX screens' entry, so the application's own (stricter) type-check does not read the vendored sources.
declare module '@tsfx-entry' {
  import type { ComponentType } from 'react'
  export const UploadScreen: ComponentType
  export const ListScreen: ComponentType
  export const UpdatePriceScreen: ComponentType
  export const ManageScreen: ComponentType
  export const ProposeScreen: ComponentType
  export const InvoiceScreen: ComponentType
}
