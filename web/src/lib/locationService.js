/**
 * Location Service for KOI Platform
 * Uses Nominatim (OpenStreetMap) API for Geocoding and Search
 */

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

export const locationService = {
  /**
   * Promisified wrapper around navigator.geolocation
   * @returns {Promise<{lat: number, lon: number}>}
   */
  getCurrentLocation: () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        (error) => {
          // Handle specific permission errors
          if (error.code === error.PERMISSION_DENIED) {
            reject(new Error("PERMISSION_DENIED"));
          } else {
            reject(new Error("Unable to retrieve location"));
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  },

  /**
   * Reverse geocode coordinates to an address using Nominatim
   * @param {number} lat 
   * @param {number} lon 
   */
  reverseGeocode: async (lat, lon) => {
    try {
      const response = await fetch(
        `${NOMINATIM_BASE_URL}/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
        {
          headers: {
            "Accept-Language": "en",
          },
        }
      );
      
      if (!response.ok) throw new Error("Failed to reverse geocode");
      
      const data = await response.json();
      
      // Extract specific fields
      const address = data.address || {};
      
      const city = address.city || address.town || address.village || address.county || "";
      const state = address.state || "";
      const pincode = address.postcode || "";
      const country = address.country || "";
      const area = address.suburb || address.neighbourhood || address.residential || "";

      return {
        city,
        state,
        pincode,
        country,
        area,
        display_name: data.display_name
      };
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      throw error;
    }
  },

  /**
   * Search for locations by text query using Nominatim
   * @param {string} query 
   */
  searchLocation: async (query) => {
    if (!query || query.trim().length < 3) return [];
    
    try {
      // Restrict to India for KOI platform context if desired, or keep it global
      const response = await fetch(
        `${NOMINATIM_BASE_URL}/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=in`,
        {
          headers: {
            "Accept-Language": "en",
          },
        }
      );

      if (!response.ok) throw new Error("Search failed");
      
      const results = await response.json();
      
      return results.map(data => {
        const address = data.address || {};
        return {
          display_name: data.display_name,
          lat: parseFloat(data.lat),
          lon: parseFloat(data.lon),
          city: address.city || address.town || address.village || address.county || "",
          state: address.state || "",
          pincode: address.postcode || "",
          country: address.country || "",
          area: address.suburb || address.neighbourhood || address.residential || "",
        };
      });
    } catch (error) {
      console.error("Location search error:", error);
      throw error;
    }
  }
};
