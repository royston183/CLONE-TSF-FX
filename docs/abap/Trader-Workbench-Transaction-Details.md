# Trader Workbench transaction details

The transaction hyperlink opens a read-only detail dialog. Each open and Refresh details reads
`GET /api/fx/FxTransaction(CompanyCode='...',FinancialTransaction='...')` through the existing
SAP gateway and ZFS_SD_TRMFX query implementation. Never select a transaction by number alone.
The dialog uses the existing BAPI-backed read; it does not invoke a write action.

The Structure tab follows the supplied SAP GUI examples: company/product/transaction/activity
header, FX Structure, NDF Settlement where applicable, and Contract Conclusion. Administration
shows the associated TrmFxApp references and remarks. SAP ActivityCategory is displayed with
its actual code; it is not the GUI activity sequence (2 or 3).

## Verified against SAP on 22 October 2026

Live metadata and read-only GETs for SG03/2000000000079 and IN11/3000000000051 confirmed:

- Core fields: ProductType, TransactionType, Partner, ContractDate, BuyCurrency, SellCurrency,
  LeadCurrency, FollowCurrency, TradedCurrency, BuyAmount, SellAmount, ValueDate, SpotRate,
  SwapRate, ForwardRate, Portfolio, ValuationClass, ActiveStatus, ActivityCategory.
- NDF fields: NdfFixingCurrency, NdfFixingDate, FixingReferenceId.
- The NDF has traded USD 4,000 sold against INR 364,000, rate 91, fixing 20 November 2026,
  value 24 November 2026, and category 65. The forward has traded USD 80,000,000 bought
  against INR 6,400,000,000, rate 80, value 20 November 2026, and category 30.
- ProductType/ProductTypeName comes from the trmmaster service. Partner and transaction-type
  names use the existing businesspartner and trmmaster lookup helpers.

These live reads confirm that **the current OData metadata does not expose every screenshot
field**. Values absent from the service are shown as an em dash. Served numeric zero is
retained as zero. No market rate, fixing, cash settlement,
settlement leg or contract time is calculated or copied from the screenshots.

## Optional read extension required in SAP

Add the following read-only properties to ZFS_CE_TrmFxTP and its service projection, populate
in ZCL_FS_TRM_FX_QUERY=>read_deal, and mark readonly in the BDEF where applicable. Read the
corresponding BAPI_FTR_FXT_GETDETAIL return structures; verify the precise component names
in this SAP release in SE37/SE11 before implementation. This repository has no deployable
source for that query implementation, so this document specifies the frontend contract.
Once supplied under these names, the existing dialog displays them on the next refresh.

| OData property | Display / source |
| --- | --- |
| NdfFixingRate | Settlement rate; returncashsettlement-ndf_fixing_rate |
| CashSettlementAmount | Signed cash amount; returncashsettlement-cash_settlement_amount |
| CashSettlementCurrency | Cash currency; returncashsettlement-cash_settlement_currency |
| SettlementFlowType / SettlementFlowTypeName | Settlement flow code and customizing description |
| SettlementBuyAmount / SettlementSellAmount | Signed settlement leg amounts, in BuyCurrency / SellCurrency; return actual legs rather than recalculating |
| LiquidityEffect | FX liquidity effect from the deal structure |
| MarketSpotRate / MarketSwapRate / MarketRateTime | Market quotation saved for this transaction and its time, rather than today's exchange rate |
| ContractTime / ContractTimeZone | Contract conclusion time and original time zone |
| Trader / ContactPerson / MIC | Contract conclusion fields |
| ExternalReference | External reference; see ZFS_SD_TRMFX-ExternalReference.md |

Rates use nine decimals. Amounts use currency decimals. Missing fields remain empty internally;
zero is never substituted for missing data. For NDFs, the existing middleware `tsfvFx` read is
filtered and checked on BUKRS + RFHA to supplement NDF_DATE, NDF_REF, NDF_RATE, ZCASH_AMT and
CASH_CURR until OData supplies them. OData values take priority, including a served zero.
Supplementary failure leaves core OData details usable and shows a retry notice.

Spot, forward, NDF and DNDF transactions served by FxTransaction use the same dialog. An
options BAPI/service is not currently exposed in this application; this change does not invent
an option detail endpoint or enable option transactions absent from the workbench.
