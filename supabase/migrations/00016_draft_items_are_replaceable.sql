-- ============================================================================
-- KOI — A draft's lines must be replaceable
--
-- 00011 gave fulfilment_intent_items SELECT, INSERT and UPDATE policies and
-- deliberately no DELETE, on the reasoning that a hand-off record is an audit
-- trail and audit trails are not deletable. That reasoning is right about a
-- HANDED-OFF intent and wrong about a DRAFT: a draft is the shopper's current
-- basket, and a basket whose lines can only ever be added to is not a basket.
--
-- WHAT THE OMISSION ACTUALLY DID:
-- fulfilmentService.openDraft() replaces the lines wholesale — DELETE, then
-- INSERT — and says so in a comment. RLS refused the DELETE silently, because a
-- policy that does not exist is not an error, it is zero rows affected. Every
-- trip through checkout therefore APPENDED another copy of the basket. One live
-- intent finished with four line rows for a basket that had one, while
-- item_count on the parent said 1 — the count and the lines disagreeing about
-- the same hand-off.
--
-- WHY THIS IS NARROW:
-- DELETE is granted only for items belonging to the caller's OWN intent while
-- that intent is still `draft`. Once it is handed off, abandoned or reported
-- delivered, the lines are frozen exactly as 00011 intended — a shopper cannot
-- rewrite the history of something KOI has already acted on. fulfilment_intents
-- itself still has no DELETE policy at all.
-- ============================================================================

-- The table has never had DELETE granted, so the policy alone would not be
-- enough. Stated explicitly rather than left to Supabase's defaults, for the
-- same reason 00013 stated the customer-tier grants.
GRANT DELETE ON fulfilment_intent_items TO authenticated;
GRANT DELETE ON fulfilment_intent_items TO anon;

DROP POLICY IF EXISTS fulfilment_items_delete_own_draft ON fulfilment_intent_items;
CREATE POLICY fulfilment_items_delete_own_draft
  ON fulfilment_intent_items
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM fulfilment_intents i
      WHERE i.id = fulfilment_intent_items.intent_id
        AND i.profile_id = public.koi_uid()
        AND i.state = 'draft'
    )
  );

COMMENT ON POLICY fulfilment_items_delete_own_draft ON fulfilment_intent_items IS
  'Lets a shopper replace the lines of their own DRAFT basket. Deliberately does not extend past draft: once an intent is handed off, abandoned or reported delivered its lines are the record of what KOI actually did, and that is not the shopper''s to edit.';
