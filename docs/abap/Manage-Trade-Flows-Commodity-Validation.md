# Manage Trade Flows: commodity validation on BL assignment

Implemented from `ZSGTSF_RTF_MANAGE_UI_DATA_EXPORT_20261014_180915/SOURCE/INCLUDE__ZSGTSF_RTF_MANAGE_ASS_DEAL.abap`, `USER_COMMAND_9009` (lines 168–181).

For an FX Deal ID, the commodity of its parent master contract (`ZSGTSFTR_DEALID.ZMC_REF` joined to `ZSGTSFTR_MAS_CON.ZMC_REF_NO`, field `ZCOMMODITY`) must equal the trade flow's GT commodity (`ZTRM_COM_ID`). MC commodity `C001` is the multi-commodity exception. The ABAP applies this comparison to FX only; other structures retain their existing assignment rules. Invoice commodity and editable BL grade text are not compared. Compliance's “Yes With Exception” does not bypass this check.

The supplied export still contains the active FX comparison, but its `GET_DEAL_DETAILS` join that populated `GV_CMMD` is commented out (lines 703–711). The web explicitly reads the parent MC and displays its commodity code and description in MC Details. Missing FX MC data blocks assignment; it never counts as a match.

The popup validates before staging Assign. Update re-reads the Deal ID and MC before any selected BL is inserted or updated, so changes to the MC after staging are checked as well. Existing amount and quantity checks remain in place. This is enforcement in the web assignment flow; the external middleware's generic table writer is not modified here.
