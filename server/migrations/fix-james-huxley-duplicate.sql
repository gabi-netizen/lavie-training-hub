-- Fix James Huxley duplicate user (25/6/2026)
-- User 9696 = correct (team=retention, cloudtalkAgentId=558210)
-- User 250557 = duplicate (no team, needs to be deleted)

-- Step 1: Move any call_analyses from duplicate user to correct user
UPDATE call_analyses SET userId = 9696 WHERE userId = 250557;

-- Step 2: Fix callType for James's calls that were incorrectly classified as cold_call
-- James is retention, so his calls should be 'other' (AI will classify the exact type)
UPDATE call_analyses SET callType = 'other' WHERE userId = 9696 AND callType = 'cold_call';

-- Step 3: Delete the duplicate user record
DELETE FROM users WHERE id = 250557;
