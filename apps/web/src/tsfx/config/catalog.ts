// Navigation catalogue (same shape as ALM config/catalog.mjs): left-rail pages → folders → applications.
// Register standard modules in src/modules/registry.ts, or custom pages in src/pages/registry.ts.
import type { IllustrationName } from '@tsfx/components/normal/Illustration';

/**
 * The curated icons of pages, folders and applications (src/components/ui/icons.ts maps each to its lucide icon).
 * Pick by the business noun (docs/how-to-add-an-application.md §3); siblings never share one.
 */
export type IconName =
  | 'overview' | 'dashboard' | 'reports' | 'analytics' | 'trends'
  | 'database' | 'settings' | 'connection' | 'services' | 'appearance' | 'integrations' | 'workflow' | 'notifications'
  | 'customers' | 'onboarding' | 'kyc' | 'approvals' | 'verified'
  | 'loans' | 'drawdowns' | 'collateral' | 'treasury' | 'deals' | 'cashflow' | 'collections' | 'payments' | 'fees' | 'interest'
  | 'accounting' | 'journal' | 'documents' | 'entries' | 'upload' | 'facilities' | 'counterparties' | 'limits' | 'schedule'
  | 'folder' | 'application' | 'samples';
export interface CatalogNode {
  id: string;
  title: string;
  description: string;
  type: 'overview' | 'folder' | 'application' | 'settings';
  /** Its icon on the rail and on its tile; without one, iconOf falls back to the module's kind, then the node's type. */
  icon?: IconName;
  /** Normal theme: the picture in its page header (components/normal/Illustration.tsx); 'analytics' when unset. */
  illustration?: IllustrationName;
  section?: string;
  /** An application's module; on the overview page, the dashboard it shows (its Overview). */
  module?: string;
  /** A custom React page from src/pages/registry.ts; takes precedence over the default content. */
  page?: string;
  /** A custom page can provide its own heading as part of its layout. */
  heading?: 'default' | 'custom';
  service?: string;
  /** The SAP transaction the screen was converted from (TSF - FX Application), shown on planned screens. */
  tcode?: string;
  settings?: 'sap-connection' | 'service-mappings' | 'appearance';
  /** Gallery sample: shown only while the UI Gallery is enabled. */
  devOnly?: boolean;
  children?: CatalogNode[];
}
export interface CatalogPage extends CatalogNode { short: string; icon: IconName; code: string }
export interface AppEntry extends CatalogNode { href: string }

export const applicationPages: CatalogPage[] = [
  { id: 'overview', title: 'Overview', short: 'Overview', icon: 'overview', type: 'overview', module: 'fx-overview', code: 'TSF FX', description: 'TSF foreign exchange, at a glance.' },
  {
    id: 'master-data', title: 'Master Data', short: 'Master Data', icon: 'database', type: 'folder', code: 'TSF FX',
    description: 'The commodity master that prices and trade flows refer to.',
    children: [
      { id: 'maintain-commodity', title: 'Maintain Commodity', type: 'application', icon: 'database', module: 'commodity', service: 'tradeflow', description: 'Create, change and delete commodities with their unit and currency.' }
    ]
  },
  {
    id: 'trade-flows', title: 'Trade Flows', short: 'Trade Flows', icon: 'workflow', type: 'folder', code: 'TSF FX',
    description: 'Upload shipments as trade flows, price them by commodity and follow them up.',
    children: [
      { id: 'tradeflows-upload', title: 'Tradeflows Upload', type: 'application', icon: 'upload', module: 'tradeflow-upload', service: 'tradeflow', description: 'Upload the trade-flow Excel file: one trade flow and one Bill of Lading per row. The new TF and BL numbers show in Tradeflows List.' },
      { id: 'tradeflows-list', title: 'Tradeflows List', type: 'application', icon: 'reports', module: 'tradeflow', service: 'tradeflow', description: 'Every trade flow with its Bill of Lading, priced at the commodity price of its TF date, and its value.' },
      { id: 'update-price', title: 'Update Price', type: 'application', icon: 'interest', page: 'update-price', service: 'tradeflow', description: 'Pick a date, see every commodity with its price for that day, and set the missing ones.' },
      { id: 'manage-tradeflows', title: 'Manage Tradeflows', type: 'application', icon: 'workflow', page: 'manage-tradeflows', service: 'tradeflow', description: 'Split a trade flow into BLs within its quantity, add BLs or delete one.' },
      { id: 'propose-tradeflow', title: 'Propose Tradeflow', type: 'application', icon: 'approvals', page: 'propose-tradeflows', service: 'tradeflow', description: 'AI-ranked proposals of free BLs that match each Deal ID by commodity and USD value (±1%).' }
    ]
  },
  {
    id: 'fx-structure', title: 'FX Structure', short: 'FX', icon: 'treasury', type: 'folder', code: 'TSF FX',
    description: 'Master contracts, front office, mid office and settlement of TSF FX deals.',
    children: [
      {
        id: 'master-contract', title: 'FX Master Contract', type: 'folder', icon: 'facilities', description: 'Create, confirm, correct and expire the master contracts that FX deals are linked to.',
        children: [
          { id: 'limit-management', title: 'Merchanting Dashboard: Limit Management', type: 'application', icon: 'limits', page: 'ref-limit-management', heading: 'custom', tcode: 'ZSGTSFP021', description: 'Limits and utilisation of the merchanting master contracts.' },
          { id: 'fo-create-master-contract', title: 'FO: Create Master Contract', type: 'application', icon: 'documents', module: 'master-contract', tcode: 'ZSGTSFP001', description: 'Create, edit and copy commodity master contracts and release them to the Mid Office.' },
          { id: 'mo-confirm-master-contract', title: 'MO: Confirm Master Contract', type: 'application', icon: 'verified', page: 'ref-mo-confirm-master-contract', heading: 'custom', tcode: 'ZSGTSFR011', description: 'Confirm or return the master contracts released by the Front Office.' },
          { id: 'mo-update-mc-expiry', title: 'MO: Update MC Expiry', type: 'application', icon: 'schedule', page: 'ref-mo-update-mc-expiry', heading: 'custom', tcode: 'ZSGTSFR049', description: 'Move the expiry of confirmed master contracts.' },
          { id: 'fo-mc-error-correction', title: 'FO: MC Error Correction', type: 'application', icon: 'workflow', page: 'ref-fo-mc-error-correction', heading: 'custom', tcode: 'ZSGTSFR093', description: 'Correct master contracts the Mid Office returned.' },
          { id: 'mo-reject-mc-after-expiry', title: 'MO: Reject MC after Expiry', type: 'application', icon: 'notifications', page: 'ref-mo-reject-mc-after-expiry', heading: 'custom', tcode: 'ZSGTSFR097', description: 'Reject master contracts that expired unused.' },
          { id: 'short-straddle-deal-id', title: 'Create Deal ID for Short Straddle Deals', type: 'application', icon: 'entries', page: 'ref-short-straddle-deal-id', heading: 'custom', tcode: 'ZSGTSFR102', description: 'Create the Deal ID of a short straddle from its master contract.' }
        ]
      },
      {
        id: 'front-office', title: 'FX Front-Office', type: 'folder', icon: 'deals', description: 'Book FX deals, create and change Deal IDs, and settle them from the trader workbench.',
        children: [
          { id: 'fx-blotter', title: 'DE6: TSF FX Blotter', type: 'application', icon: 'deals', page: 'fx-blotter', heading: 'custom', tcode: 'ZSGTSFP008', description: 'Capture TSF FX deals on the blotter, create them in SAP and release them to the Mid Office.' },
          { id: 'option-blotter', title: 'DE7: TSF Option Blotter', type: 'application', icon: 'treasury', page: 'planned', tcode: 'ZSGTSFP010', description: 'Capture TSF FX option deals.' },
          { id: 'fo-fx-error-correction', title: 'EC2: TSF FO Error Correction - FX & Options', type: 'application', icon: 'workflow', page: 'ref-fo-fx-error-correction', heading: 'custom', tcode: 'ZSGTSFR052', description: 'Correct FX and option deals the Mid Office returned.' },
          { id: 'fo-change-deal-id', title: 'FO: Change Deal ID', type: 'application', icon: 'entries', page: 'ref-fo-change-deal-id', heading: 'custom', tcode: 'ZSGTSFP013', description: 'Change the Deal ID of FX transactions.' },
          { id: 'fo-create-deal-id-manually', title: 'FO: Create Deal ID Manually', type: 'application', icon: 'documents', page: 'ref-fo-create-deal-id-manually', heading: 'custom', tcode: 'ZSGTSFR079', description: 'Create a Deal ID by hand for existing transactions.' },
          { id: 'fo-early-delivery-unwind-rollover', title: 'FO: Create Early Delivery/Unwinding/Rollover', type: 'application', icon: 'schedule', page: 'ref-fo-early-delivery-unwind-rollover', heading: 'custom', tcode: 'ZSGTSFP015', description: 'Early delivery, unwinding and rollover of FX forwards.' },
          { id: 'fo-additional-spot-booking', title: 'FO: Additional Spot Booking', type: 'application', icon: 'cashflow', page: 'ref-fo-additional-spot-booking', heading: 'custom', tcode: 'ZSGTSFR094', description: 'Book an additional spot against a Deal ID.' },
          { id: 'fo-trader-workbench', title: 'FO: Trader Workbench', type: 'application', icon: 'dashboard', page: 'trader-workbench', heading: 'custom', tcode: 'ZSGTSFR100', description: 'Settle Deal IDs: exercise or expire options, fix NDFs and book settlement spots.' },
          { id: 'view-short-straddle', title: 'FO: View Short Straddle (Single Deal ID)', type: 'application', icon: 'analytics', page: 'planned', tcode: 'ZSGTSFP018', description: 'The legs and spots of one short straddle Deal ID.' },
          {
            id: 'ndf-fixing', title: 'NDF Fixing', type: 'folder', icon: 'interest', description: 'Fix NDF rates and correct fixings.',
            children: [
              { id: 'tsf-ndf-fixing', title: 'UA1: TSF NDF Fixing', type: 'application', icon: 'interest', page: 'ref-tsf-ndf-fixing', heading: 'custom', tcode: 'ZSGTSFR050', description: 'Record the fixing rate of TSF NDF deals.' },
              { id: 'fo-ndf-fixing-error-correction', title: 'AE1: TSF FO Error Correction - NDF Fixing', type: 'application', icon: 'workflow', page: 'ref-fo-ndf-fixing-error-correction', heading: 'custom', tcode: 'ZSGTSFR025', description: 'Correct NDF fixings the Mid Office returned.' }
            ]
          }
        ]
      },
      {
        id: 'mid-office', title: 'FX Mid-Office', type: 'folder', icon: 'approvals', description: 'Confirm FX deals and Deal IDs, update bank references and invoice Deal IDs.',
        children: [
          {
            id: 'deal-confirmation', title: 'FX Deal Confirmation', type: 'folder', icon: 'verified', description: 'Confirm FX and option deals and NDF fixings.',
            children: [
              { id: 'mo-fx-deal-confirmation', title: 'TSF MO Deal Confirmation - FX & Options', type: 'application', icon: 'deals', page: 'deal-confirmation', heading: 'custom', tcode: 'ZSGTSFR024', description: 'Match and release, or return for correction, the FX and option deals the Front Office released.' },
              { id: 'mo-confirm-ndf-fixing', title: 'TSF MO - Confirm NDF Fixing', type: 'application', icon: 'interest', page: 'ref-mo-confirm-ndf-fixing', heading: 'custom', tcode: 'ZSGTSFR026', description: 'Confirm the NDF fixing rates.' },
              { id: 'mo-update-bank-reference', title: 'Update Bank Reference for FX Deals', type: 'application', icon: 'counterparties', page: 'ref-mo-update-bank-reference', heading: 'custom', tcode: 'ZSGTSFR002', description: 'Record the bank\'s reference on FX deals.' }
            ]
          },
          {
            id: 'deal-id-confirmation', title: 'FX Deal ID Confirmation', type: 'folder', icon: 'approvals', description: 'Review and confirm Deal IDs.',
            children: [
              { id: 'mo-view-deal-ids-for-confirmation', title: 'MO: View List of Deal IDs for Confirmation', type: 'application', icon: 'reports', page: 'ref-mo-view-deal-ids-for-confirmation', heading: 'custom', tcode: 'ZSGTSFR044', description: 'Deal IDs waiting for Mid Office confirmation.' },
              { id: 'mo-confirm-fx-deal-id', title: 'MO: Confirm FX Deal ID (Single Deal ID)', type: 'application', icon: 'verified', page: 'ref-mo-confirm-fx-deal-id', heading: 'custom', tcode: 'ZSGTSFP002', description: 'Confirm one FX Deal ID.' },
              { id: 'mo-confirm-fx-deal-id-ss', title: 'MO: Confirm FX Deal ID for SS (Single Deal ID)', type: 'application', icon: 'kyc', page: 'ref-mo-confirm-fx-deal-id-ss', heading: 'custom', tcode: 'ZSGTSFP017', description: 'Confirm one short straddle Deal ID.' }
            ]
          },
          {
            id: 'trade-invoicing', title: 'FX Trade Invoicing', type: 'folder', icon: 'fees', description: 'Mark, generate and follow up the invoices of Deal IDs.',
            children: [
              { id: 'mo-deal-id-invoice-status', title: 'MO: Check Invoice Status of Deal IDs', type: 'application', icon: 'notifications', page: 'ref-mo-deal-id-invoice-status', heading: 'custom', tcode: 'ZSGTSFR014', description: 'The invoice status of each Deal ID.' },
              { id: 'mo-deal-id-invoice-mark', title: 'MO: Mark Deal IDs for Invoicing', type: 'application', icon: 'approvals', page: 'ref-mo-deal-id-invoice-mark', heading: 'custom', tcode: 'ZSGTSFR015', description: 'Mark Deal IDs ready for invoicing.' },
              { id: 'mo-deal-id-invoicing', title: 'MO: View List of Deal IDs for Invoicing', type: 'application', icon: 'reports', page: 'ref-mo-deal-id-invoicing', heading: 'custom', tcode: 'ZSGTSFR008', description: 'Deal IDs marked for invoicing.' },
              { id: 'mo-generate-invoices-deal-id', title: 'MO: Generate Invoices for Deal ID (Single Deal ID)', type: 'application', icon: 'fees', page: 'ref-mo-generate-invoices-deal-id', heading: 'custom', tcode: 'ZSGTSFR033', description: 'Generate the invoices of one Deal ID.' }
            ]
          }
        ]
      },
      {
        id: 'back-office', title: 'FX Back-Office & Settlement', type: 'folder', icon: 'payments', description: 'Settle Deal IDs, NDFs and options, and post the month-end MTM.',
        children: [
          {
            id: 'deal-id-settlement', title: 'Deal ID Settlement', type: 'folder', icon: 'payments', description: 'Settle Deal IDs with the bank and post the accounting.',
            children: [
              { id: 'inr-heads-up-reminder', title: 'MO: INR Head-Ups Reminder', type: 'application', icon: 'notifications', page: 'ref-inr-heads-up-reminder', heading: 'custom', tcode: 'ZSGTSFR061', description: 'Remind the bank of upcoming INR settlements.' },
              { id: 'mo-view-deal-id-settlement-list', title: 'MO: View List of Deal IDs for Settlement', type: 'application', icon: 'reports', page: 'ref-mo-view-deal-id-settlement-list', heading: 'custom', tcode: 'ZSGTSFR106', description: 'Deal IDs due for settlement.' },
              { id: 'mo-execute-settlement-deal-id', title: 'MO: Execute Settlement for Deal ID (Single Deal ID)', type: 'application', icon: 'payments', page: 'execute-settlement', heading: 'custom', tcode: 'ZSGTSFR060', description: 'Settle every FX and trade-invoice leg of one Deal ID.' },
              { id: 'mo-bank-settlement-fx-non-flow', title: 'MO: Bank Settlement: FX Non-Flow Deals', type: 'application', icon: 'cashflow', page: 'ref-mo-bank-settlement-fx-non-flow', heading: 'custom', tcode: 'ZSGTSFR104', description: 'Mid Office bank settlement of non-flow FX deals.' },
              { id: 'bo-post-accounting-settlement', title: 'BO: Post Accounting Entries for Settlement (Single Deal ID)', type: 'application', icon: 'journal', page: 'ref-bo-post-accounting-settlement', heading: 'custom', tcode: 'ZSGTSFR081', description: 'Post the accounting entries of one settled Deal ID.' },
              { id: 'bo-bank-settlement-fx-non-flow', title: 'BO: Bank Settlement: FX Non-Flow Deals', type: 'application', icon: 'collections', page: 'ref-bo-bank-settlement-fx-non-flow', heading: 'custom', tcode: 'ZSGTSFR103', description: 'Back Office bank settlement of non-flow FX deals.' },
              { id: 'view-spot-forward-settlement', title: 'View Spot-Forward Deals Settlement', type: 'application', icon: 'analytics', page: 'ref-view-spot-forward-settlement', heading: 'custom', tcode: 'ZSGTSFR062', description: 'Settlement of spot and forward deals.' },
              { id: 'tbb1-post-flows', title: 'TBB1 Posting - SAP Standard', type: 'application', icon: 'accounting', page: 'ref-tbb1-post-flows', heading: 'custom', tcode: 'TBB1', description: 'Post due flows with the SAP standard TBB1.' },
              { id: 'bo-deal-rejection', title: 'BO deal Rejection and return to FO', type: 'application', icon: 'workflow', page: 'ref-bo-deal-rejection', heading: 'custom', tcode: 'ZSGTSFR092', description: 'Reject a deal and return it to the Front Office.' },
              { id: 'bo-settlement-tsf-fx', title: 'BO: Settlement of TSF FX deals', type: 'application', icon: 'verified', page: 'planned', tcode: 'ZSGTSFR098', description: 'Back Office settlement of TSF FX deals.' }
            ]
          },
          {
            id: 'ndf-option-settlement', title: 'NDF & Option Settlement', type: 'folder', icon: 'interest', description: 'Settle NDFs, option premiums and NDO cash.',
            children: [
              { id: 'fx-ndf-settlement', title: 'FX NDF Settlement', type: 'application', icon: 'interest', page: 'ref-fx-ndf-settlement', heading: 'custom', tcode: 'ZSGTSFR028', description: 'Settle fixed NDF deals.' },
              { id: 'option-premium-settlement', title: 'Option Settlement: Option Premium', type: 'application', icon: 'fees', page: 'planned', tcode: 'ZSGTSFR029', description: 'Settle option premiums.' },
              { id: 'ndo-cash-settlement', title: 'Option Settlement: NDO Cash Settlement', type: 'application', icon: 'payments', page: 'planned', tcode: 'ZSGTSFR027', description: 'Cash settlement of non-deliverable options.' }
            ]
          },
          {
            id: 'month-end-mtm', title: 'Month-end MTM Accounting', type: 'folder', icon: 'accounting', description: 'Post and reverse the month-end FX mark-to-market.',
            children: [
              {
                id: 'fx-mtm', title: 'FX MTM', type: 'folder', icon: 'trends', description: 'Post the month-end FX MTM to accounting.',
                children: [
                  { id: 'post-fx-mtm-oil-dmcc', title: 'Post FX MTM to Accounting - OIL & DMCC (USD)', type: 'application', icon: 'journal', page: 'ref-post-fx-mtm-oil-dmcc', heading: 'custom', tcode: 'ZSGTSFR022', description: 'Post the FX MTM of OIL and DMCC in USD.' },
                  { id: 'post-fx-mtm-other-origins', title: 'Post FX MTM to Accounting - Other Origins', type: 'application', icon: 'accounting', page: 'ref-post-fx-mtm-other-origins', heading: 'custom', tcode: 'ZSGTSFR023', description: 'Post the FX MTM of the other origins.' },
                  { id: 'corporate-mtm-rates', title: 'View Corporate MTM Rates', type: 'application', icon: 'interest', page: 'planned', tcode: 'ZSGTRMP038', description: 'The corporate MTM rates of the month end.' },
                  { id: 'fx-mtm-external-tsf-deals', title: 'FX MTM - External and TSF Deals - SG00', type: 'application', icon: 'analytics', page: 'ref-fx-mtm-external-tsf-deals', heading: 'custom', tcode: 'ZSGTSFR084', description: 'FX MTM of external and TSF deals for SG00.' }
                ]
              },
              {
                id: 'month-end-reversals', title: 'Month-end Reversals', type: 'folder', icon: 'schedule', description: 'Reverse the month-end MTM postings.',
                children: [
                  { id: 'bo-reverse-fx-mtm-oil-dmcc', title: 'Reverse FX MTM - OIL & DMCC (USD)', type: 'application', icon: 'journal', page: 'ref-bo-reverse-fx-mtm-oil-dmcc', heading: 'custom', tcode: 'ZSGTSFR019', description: 'Reverse the FX MTM of OIL and DMCC.' },
                  { id: 'bo-reverse-fx-mtm-other-origins', title: 'Reverse FX MTM - Other Origins', type: 'application', icon: 'accounting', page: 'ref-bo-reverse-fx-mtm-other-origins', heading: 'custom', tcode: 'ZSGTSFR020', description: 'Reverse the FX MTM of the other origins.' },
                  { id: 'bo-reverse-fx-mtm-india', title: 'Reverse FX MTM - India', type: 'application', icon: 'entries', page: 'ref-bo-reverse-fx-mtm-india', heading: 'custom', tcode: 'ZSGTSFR021', description: 'Reverse the FX MTM of India.' },
                  { id: 'option-premium-deferral', title: 'Option Premium Deferral', type: 'application', icon: 'fees', page: 'planned', tcode: 'ZSGTSFR018', description: 'Defer option premiums at month end.' }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'reporting', title: 'Reporting', short: 'Reporting', icon: 'reports', type: 'folder', code: 'TSF FX',
    description: 'Read-only reports of FX transactions and TSF deals.',
    children: [
      { id: 'view-all-transactions', title: 'View List of All Transactions', type: 'application', icon: 'deals', page: 'ref-view-all-transactions', heading: 'custom', tcode: 'ZSGTRM_RFX_BLOTTER_LIST', description: 'Deal Dump: FX transactions by company and blotter, trade or value date.' },
      { id: 'view-tsf-deals', title: 'View List of TSF Deals', type: 'application', icon: 'reports', module: 'tsf-deals', tcode: 'ZSGTSF_RFX_BLOTTER_COMP', description: 'Read-only Forex deal report by company, blotter date and trader.' },
      { id: 'deal-id-details', title: 'Deal ID Details', type: 'application', icon: 'documents', page: 'ref-deal-id-details', heading: 'custom', tcode: 'ZSGTSF_RDEAL_ID_DETAIL', description: 'Everything about one Deal ID: its transactions, master contract and P&L.' }
    ]
  },
  {
    id: 'settings', title: 'Settings', short: 'Settings', icon: 'settings', type: 'folder', code: 'WORKSPACE',
    description: 'Manage your SAP connection, service mappings and appearance.',
    children: [
      { id: 'sap-connection', title: 'SAP Connection', type: 'settings', icon: 'connection', settings: 'sap-connection', description: 'Set the SAP account of this tab and test the OData services.' },
      { id: 'service-mappings', title: 'Service Mappings', type: 'settings', icon: 'services', settings: 'service-mappings', description: 'See which SAP OData service each application uses.' },
      { id: 'appearance', title: 'Appearance', type: 'settings', icon: 'appearance', settings: 'appearance', description: 'Choose the light or dark workspace.' }
    ]
  }
];

// Examples are mounted only by the isolated test build, never the application preview or release.
const testSamples: CatalogPage = {
    id: 'samples', title: 'Samples', short: 'Samples', icon: 'samples', type: 'folder', code: 'DEVELOPER', devOnly: true,
    description: 'The data-entry templates on sample data (developers only, never SAP).',
    children: [
      { id: 'portfolio-overview', title: 'Portfolio Overview', type: 'application', icon: 'overview', module: 'sample-portfolio', devOnly: true, description: 'T-overview: every Overview part on a sample treasury portfolio (a pattern, not TSF FX).' },
      { id: 'time-buckets', title: 'Time Buckets', type: 'application', icon: 'schedule', module: 'timebuckets', service: 'timebuckets', devOnly: true, description: 'Reference SAP table maintenance of the template (ALM time buckets); not part of TSF FX.' },
      { id: 'deals', title: 'Deals', type: 'application', icon: 'deals', module: 'sample-deals', devOnly: true, description: 'T-large-list and T-object: a paged list whose rows open as a pop-up.' },
      { id: 'monthly-amounts', title: 'Monthly Amounts', type: 'application', icon: 'entries', module: 'sample-monthly', devOnly: true, description: 'T-items: a selection bar, an editable grid and totals per currency.' },
      { id: 'budget-upload', title: 'Budget Upload', type: 'application', icon: 'upload', module: 'sample-budget', devOnly: true, description: 'T-upload: a spreadsheet checked row by row, then posted at once.' },
      { id: 'liquidity-statement', title: 'Liquidity Statement', type: 'application', icon: 'reports', module: 'sample-liquidity', devOnly: true, description: 'T-report: a formatted SAP report with breakdowns and drill to Deals.' },
      { id: 'cash-flow-lines', title: 'Cash Flow Lines', type: 'application', icon: 'cashflow', module: 'sample-cashflow', devOnly: true, description: 'T-line-report: line items arranged by ALV layouts, subtotals per currency.' },
      { id: 'treasury-overview', title: 'Treasury Overview', type: 'application', icon: 'dashboard', module: 'sample-treasury', devOnly: true, description: 'T-dashboard: key figures, trends and a summary with drill-down.' }
    ]
  };
export const pages: CatalogPage[] = (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test'
  ? [...applicationPages.slice(0, -1), testSamples, applicationPages[applicationPages.length - 1]]
  : applicationPages;

export const hrefOf = (ids: string[]): string => `/${ids.join('/')}`;

/** The URL of the application that shows a module (Gallery samples included), or null when none does. */
export function hrefOfModule(moduleId: string, nodes: CatalogNode[] = pages): string | null {
  const find = (list: CatalogNode[], parents: string[]): string | null => {
    for (const n of list) {
      const ids = [...parents, n.id];
      if (n.type === 'application' && n.module === moduleId) return hrefOf(ids);
      // The overview page's dashboard is the workspace's home.
      if (n.type === 'overview' && n.module === moduleId) return '/';
      const hit = find(n.children ?? [], ids);
      if (hit) return hit;
    }
    return null;
  };
  return find(nodes, []);
}

/** The URL of the catalogue node that shows a custom page (`page: <id>`), or null when none does. */
export function hrefOfPage(pageId: string, nodes: CatalogNode[] = pages): string | null {
  const find = (list: CatalogNode[], parents: string[]): string | null => {
    for (const n of list) {
      const ids = [...parents, n.id];
      if (n.page === pageId) return n.type === 'overview' ? '/' : hrefOf(ids);
      const hit = find(n.children ?? [], ids);
      if (hit) return hit;
    }
    return null;
  };
  return find(nodes, []);
}

/** Rail pages, with test-only example nodes subject to the Gallery flag. */
export const visiblePages = (gallery: boolean, nodes: CatalogPage[] = pages): CatalogPage[] => nodes.filter(p => gallery || !p.devOnly);

/** Page, breadcrumb trail and current node of a URL path; `invalid` when a segment does not exist (or is a hidden sample). */
export function resolveTrail(path: string[], gallery = true, nodes: CatalogPage[] = pages): { page: CatalogPage; trail: CatalogNode[]; current: CatalogNode; invalid: boolean } {
  const shown = visiblePages(gallery, nodes);
  const page = shown.find(p => p.id === path[0]) ?? shown[0];
  const trail: CatalogNode[] = [page];
  let current: CatalogNode = page;
  for (const id of path.slice(1)) {
    const next = current.children?.find(n => n.id === id && (gallery || !n.devOnly));
    if (!next) break;
    trail.push(next);
    current = next;
  }
  const invalid = path.length > 0 && (page.id !== path[0] || trail.length !== path.length);
  return { page, trail, current, invalid };
}

function collect(nodes: CatalogNode[], parents: string[]): AppEntry[] {
  return nodes.filter(n => !n.devOnly).flatMap(n => (n.type === 'application' ? [{ ...n, href: hrefOf([...parents, n.id]) }] : collect(n.children ?? [], [...parents, n.id])));
}
/** Every application of a catalogue with its URL (Gallery samples left out). */
export const applicationsOf = (nodes: CatalogNode[]): AppEntry[] => collect(nodes, []);
/** Every application with its URL (Overview tiles, Service Mappings). */
export const applications: AppEntry[] = applicationsOf(pages);
