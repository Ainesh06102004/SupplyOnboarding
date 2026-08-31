"use client";

// ============================================================================
// KOI STORE — Goal profile sync
// Renders nothing. On sign-in, pulls the shopper's stored goal profile into
// goalStore so their macro targets and preferences follow them across devices.
//
// The stored profile wins over whatever is in localStorage: a signed-in
// shopper's saved profile is the durable one, and localStorage may hold a
// stale copy from a different session on a shared machine.
//
// If the shopper set a goal while signed out and then signs in, the local
// profile is pushed up rather than discarded — losing a profile someone just
// filled in is worse than a slightly surprising merge.
// ============================================================================

import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGoalStore } from "@/store/goalStore";
import { loadGoalProfile, saveGoalProfile } from "@/lib/supabase/goalProfileService";

export default function GoalProfileSync() {
  const { user } = useAuth();
  const hydrate = useGoalStore((s) => s.hydrate);
  const setProfile = useGoalStore((s) => s.setProfile);

  useEffect(() => {
    hydrate();
    if (!user?.uid) return;

    let alive = true;
    (async () => {
      try {
        const stored = await loadGoalProfile(user.uid);
        if (!alive) return;

        if (stored?.goal) {
          setProfile(stored);
          return;
        }

        // Nothing stored yet — keep what this shopper set while signed out.
        const local = useGoalStore.getState().profile;
        if (local?.goal) await saveGoalProfile(user.uid, local);
      } catch (err) {
        // A sync failure must never cost the shopper their local profile.
        console.error("Could not sync goal profile:", err);
      }
    })();

    return () => { alive = false; };
  }, [user?.uid, hydrate, setProfile]);

  return null;
}
