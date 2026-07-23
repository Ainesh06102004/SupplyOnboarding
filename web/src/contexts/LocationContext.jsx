"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";

const LocationContext = createContext();

const LOCAL_STORAGE_KEY = "koi-store-location";

const DEFAULT_LOCATION = {
  city: "Bengaluru",
  state: "Karnataka",
  country: "India",
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
            .select("city, state, country, lat, lng")
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
            lat: newLocation.lat,
            lng: newLocation.lng,
          });
      } catch (err) {
        console.error("Error saving location to profile:", err);
      }
    }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        // In a real app, you would use a reverse geocoding API here.
        // For this mock, we'll just set it to a detected location placeholder.
        const mockCity = "Detected Location"; 
        
        await setLocation({
          city: mockCity,
          state: "Current State",
          country: "India",
          lat: latitude,
          lng: longitude,
        });
      },
      (error) => {
        console.error("Error detecting location:", error);
        alert("Unable to retrieve your location");
      }
    );
  };

  return (
    <LocationContext.Provider value={{ location, loading, setLocation, detectLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocationContext);
}
