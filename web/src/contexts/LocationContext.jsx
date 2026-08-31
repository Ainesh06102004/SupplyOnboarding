"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { locationService } from "@/lib/locationService";

// ============================================================================
// KOI STORE — Delivery location
// Carries the shopper's pincode, not just their city.
//
// Pincode is the unit availability is actually decided in: a marketplace
// answers "is this in stock" per delivery area, not per city. locationService
// already resolves it and LocationModal already passes it — this context used
// to receive it and throw it away, which is why nothing downstream could ask
// an availability question.
//
// `pincode` is null until the shopper sets a location. Null means unknown, and
// unknown must not be filled in with a plausible default.
// ============================================================================

const LocationContext = createContext();

const LOCAL_STORAGE_KEY = "koi-store-location";

// A city to render before the shopper chooses. Deliberately carries no
// pincode: guessing one would let the UI claim availability for an area the
// shopper never selected.
const DEFAULT_LOCATION = {
  city: "Bengaluru",
  state: "Karnataka",
  country: "India",
  area: null,
  pincode: null,
  lat: 12.9716,
  lng: 77.5946,
};

export function LocationProvider({ children }) {
  const { user } = useAuth();
  const [location, setLocationState] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load initial location
  useEffect(() => {
    async function loadLocation() {
      setLoading(true);
      try {
        if (user?.uid) {
          // Try to load from Supabase
          const supabase = getSupabaseClient();
          const { data, error } = await supabase
            .from("customer_profiles")
            .select("city, state, country, area, pincode, lat, lng")
            .eq("id", user.uid)
            .single();

          if (data && !error && data.city) {
            setLocationState(data);
            return;
          }
        }
        
        // Fallback to local storage
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          setLocationState(JSON.parse(saved));
        } else {
          setLocationState(DEFAULT_LOCATION);
        }
      } catch (err) {
        console.error("Error loading location:", err);
        setLocationState(DEFAULT_LOCATION);
      } finally {
        setLoading(false);
      }
    }

    loadLocation();
  }, [user]);

  const setLocation = async (newLocation) => {
    setLocationState(newLocation);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newLocation));

    if (user?.uid) {
      try {
        const supabase = getSupabaseClient();
        await supabase
          .from("customer_profiles")
          .upsert({
            id: user.uid,
            city: newLocation.city,
            state: newLocation.state,
            country: newLocation.country || "India",
            area: newLocation.area ?? null,
            pincode: newLocation.pincode ?? null,
            lat: newLocation.lat,
            lng: newLocation.lng,
          });
      } catch (err) {
        console.error("Error saving location to profile:", err);
      }
    }
  };

  /**
   * Resolve the shopper's position to a real area and pincode.
   *
   * This used to store the literal string "Detected Location" with a state of
   * "Current State" and no pincode, so GPS produced a location that could not
   * answer an availability question. locationService.reverseGeocode already
   * returns everything needed.
   *
   * @returns {Promise<object|null>} the resolved location, or null on failure
   */
  const detectLocation = async () => {
    try {
      const { lat, lon } = await locationService.getCurrentLocation();
      const place = await locationService.reverseGeocode(lat, lon);
      const resolved = {
        city: place.city,
        state: place.state,
        country: place.country || "India",
        area: place.area || null,
        pincode: place.pincode || null,
        lat,
        lng: lon,
      };
      await setLocation(resolved);
      return resolved;
    } catch (err) {
      console.error("Error detecting location:", err);
      return null;
    }
  };

  return (
    <LocationContext.Provider
      value={{
        location,
        loading,
        setLocation,
        detectLocation,
        // The delivery area availability is decided in. Null until the shopper
        // picks a location — callers must treat that as unknown, not as "any".
        pincode: location?.pincode ?? null,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocationContext);
}
