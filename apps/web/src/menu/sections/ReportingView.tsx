import { SectionStub } from './SectionStub.tsx'

/**
 * Reporting's landing page.
 *
 * The reports themselves are held one subtree per structure, and each structure is its own
 * entry under Reporting in the sidebar, so there is nothing to browse at this level — this
 * page says where to go rather than listing the four structures a second time.
 */
export function ReportingView() {
  return (
    <SectionStub
      title="Reporting"
      sub="Reports, grouped by the structure they belong to."
      detail="Reports are grouped by structure — FX, SLC, XLC-CRP and ICFS. Pick one in the
        sidebar under Reporting to browse the available reports."
    />
  )
}
