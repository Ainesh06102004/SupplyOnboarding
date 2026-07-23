"use client";

import { useState, useEffect, useRef } from "react";
import { MapPin, Navigation, Search, X, AlertCircle } from "lucide-react";
import { locationService } from "@/lib/locationService";

/**
 * LocationModal
 * @param {string} mode "store" | "delivery"
 * @param {boolean} open
 * @param {function} onOpenChange
 * @param {function} onComplete (data) => void 
 * @param {object} initialData For edit mode
 */
export default function LocationModal({ mode = "store", open, onOpenChange, onComplete, initialData = null }) {
  const searchInputRef = useRef(null);

  // View states: "select" (search/gps) -> "details" (form)
  const [view, setView] = useState("select");
  
  // Selection state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    id: null,
    label: "Home",
    full_name: "",
    phone: "",
    house_number: "",
    street: "",
    landmark: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
    is_default: false,
    lat: null,
    lon: null,
  });

  useEffect(() => {
    if (open) {
      if (initialData && initialData.id) {
        setFormData(initialData);
        setView("details");
      } else {
        setView("select");
        setFormData({
          id: null, label: "Home", full_name: "", phone: "",
          house_number: "", street: "", landmark: "", city: "",
          state: "", pincode: "", country: "India", is_default: false,
          lat: null, lon: null
        });
        setSearchQuery("");
        setSearchResults([]);
        setError(null);
      }
    }
  }, [open, initialData]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 3) {
        setIsSearching(true);
        try {
          const results = await locationService.searchLocation(searchQuery);
          setSearchResults(results);
          setError(null);
        } catch (err) {
          setError("Failed to fetch location suggestions.");
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleDetectLocation = async () => {
    setIsDetecting(true);
    setError(null);
    try {
      const coords = await locationService.getCurrentLocation();
      const locData = await locationService.reverseGeocode(coords.lat, coords.lon);
      processSelectedLocation({ ...locData, lat: coords.lat, lon: coords.lon });
    } catch (err) {
      if (err.message === "PERMISSION_DENIED") {
        setError("Location access denied. Please search manually.");
      } else {
        setError("Unable to detect location. Please search manually.");
      }
      // Automatically switch focus to manual search mode
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } finally {
      setIsDetecting(false);
    }
  };

  const processSelectedLocation = (loc) => {
    if (mode === "store") {
      // Store mode just needs city, area, pincode (and we pass lat/lng)
      onComplete({
        city: loc.city,
        area: loc.area || loc.display_name,
        pincode: loc.pincode,
        state: loc.state,
        country: loc.country,
        lat: loc.lat,
        lng: loc.lon
      });
      onOpenChange(false);
    } else {
      // Delivery mode prefills form and transitions view
      setFormData(prev => ({
        ...prev,
        city: loc.city,
        state: loc.state,
        pincode: loc.pincode,
        country: loc.country,
        street: loc.area || "",
        lat: loc.lat,
        lon: loc.lon
      }));
      setView("details");
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleSubmitDetails = (e) => {
    e.preventDefault();
    onComplete(formData);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-[500px] max-h-[90vh] overflow-y-auto bg-white border border-[#E2E8D8] shadow-2xl rounded-2xl animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 p-1.5 text-[#5A6B5A] hover:bg-[#E2E8D8] rounded-full transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {view === "select" ? (
          <div className="flex flex-col">
            <div className="p-6 pb-4 bg-[#F2F6EC] border-b border-[#E2E8D8]">
              <h2 className="text-xl font-bold text-[#0E4032] mb-1" style={{ fontFamily: "var(--font-koi-heading)" }}>
                {mode === "store" ? "Select your location" : "Find your address"}
              </h2>
              <p className="text-[#5A6B5A] text-sm">
                {mode === "store" 
                  ? "To see accurate availability and delivery times" 
                  : "We'll use this to prefill your delivery details"}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-[#C94B40]/10 text-[#C94B40] rounded-xl text-sm font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleDetectLocation}
                disabled={isDetecting}
                className="w-full flex items-center justify-between p-4 bg-white border border-[#E2E8D8] rounded-xl text-[#0E4032] hover:bg-[#EDF2E6] hover:border-[#0E4032]/30 transition-all shadow-sm disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#0E4032]/10 flex items-center justify-center">
                    <Navigation className={`w-4 h-4 text-[#0E4032] ${isDetecting ? 'animate-pulse' : ''}`} />
                  </div>
                  <div className="text-left">
                    <span className="block font-bold text-sm">
                      {isDetecting ? "Detecting..." : "Use current location"}
                    </span>
                    <span className="block text-xs text-[#5A6B5A]">Enable GPS for precise delivery</span>
                  </div>
                </div>
              </button>

              <div className="relative flex items-center gap-4 py-2">
                <div className="flex-1 h-px bg-[#E2E8D8]"></div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#5A6B5A]">Or</span>
                <div className="flex-1 h-px bg-[#E2E8D8]"></div>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5A6B5A]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search by area, locality, or pincode"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-[#E2E8D8] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4032]/20 focus:border-[#0E4032]/40 placeholder:text-[#5A6B5A]/60 shadow-sm"
                />
              </div>

              {(searchQuery.trim().length >= 3 || isSearching) && (
                <div className="max-h-[250px] overflow-y-auto rounded-xl border border-[#E2E8D8] bg-white divide-y divide-[#E2E8D8] shadow-inner">
                  {isSearching ? (
                    <div className="px-4 py-6 text-center text-[#5A6B5A] text-sm animate-pulse">
                      Searching...
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => processSelectedLocation(c)}
                        className="w-full text-left px-4 py-3 hover:bg-[#F2F6EC] flex items-start gap-3 transition-colors"
                      >
                        <MapPin className="w-4 h-4 text-[#5A6B5A] mt-0.5 shrink-0" />
                        <div>
                          <span className="block text-sm font-semibold text-[#0E4032] line-clamp-1">{c.display_name}</span>
                          <span className="block text-xs text-[#5A6B5A]">
                            {c.city && `${c.city}, `}{c.state} {c.pincode}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-[#5A6B5A] text-sm">
                      No locations found matching "{searchQuery}"
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="p-6 pb-4 bg-[#F2F6EC] border-b border-[#E2E8D8]">
              <h2 className="text-xl font-bold text-[#0E4032] mb-1" style={{ fontFamily: "var(--font-koi-heading)" }}>
                {formData.id ? "Edit Address" : "Complete Address"}
              </h2>
              <p className="text-[#5A6B5A] text-sm">
                Verify and add missing details
              </p>
            </div>

            <div className="p-6">
              <form onSubmit={handleSubmitDetails} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#0E4032] uppercase tracking-wider">Full Name</label>
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 bg-white border border-[#E2E8D8] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4032]/20 focus:border-[#0E4032]/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#0E4032] uppercase tracking-wider">Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 bg-white border border-[#E2E8D8] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4032]/20 focus:border-[#0E4032]/40"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#0E4032] uppercase tracking-wider">House / Flat No.</label>
                    <input
                      type="text"
                      name="house_number"
                      value={formData.house_number}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 bg-white border border-[#E2E8D8] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4032]/20 focus:border-[#0E4032]/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#0E4032] uppercase tracking-wider">Landmark</label>
                    <input
                      type="text"
                      name="landmark"
                      value={formData.landmark}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-white border border-[#E2E8D8] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4032]/20 focus:border-[#0E4032]/40 placeholder:text-[#5A6B5A]/40"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#0E4032] uppercase tracking-wider">Street / Area</label>
                  <input
                    type="text"
                    name="street"
                    value={formData.street}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 bg-white border border-[#E2E8D8] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4032]/20 focus:border-[#0E4032]/40"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4 bg-[#F2F6EC] p-3 rounded-xl border border-[#E2E8D8]">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#5A6B5A] uppercase tracking-wider">City</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      required
                      className="w-full bg-transparent text-sm font-semibold text-[#0E4032] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#5A6B5A] uppercase tracking-wider">State</label>
                    <input
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      required
                      className="w-full bg-transparent text-sm font-semibold text-[#0E4032] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#5A6B5A] uppercase tracking-wider">Pincode</label>
                    <input
                      type="text"
                      name="pincode"
                      value={formData.pincode}
                      onChange={handleChange}
                      required
                      className="w-full bg-transparent text-sm font-semibold text-[#0E4032] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-3">
                    <select
                      name="label"
                      value={formData.label}
                      onChange={handleChange}
                      className="bg-[#F2F6EC] text-[#0E4032] border border-[#E2E8D8] rounded-lg px-2 py-1.5 text-xs font-bold uppercase cursor-pointer outline-none focus:ring-2 focus:ring-[#0E4032]/20"
                    >
                      <option value="Home">Home</option>
                      <option value="Work">Work</option>
                      <option value="Other">Other</option>
                    </select>

                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="checkbox"
                          name="is_default"
                          checked={formData.is_default}
                          onChange={handleChange}
                          className="peer appearance-none w-4 h-4 border-2 border-[#E2E8D8] rounded bg-white checked:bg-[#0E4032] checked:border-[#0E4032] cursor-pointer transition-colors"
                        />
                        <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="11.667 3.5 5.25 9.917 2.333 7"></polyline>
                        </svg>
                      </div>
                      <span className="text-sm font-semibold text-[#5A6B5A] group-hover:text-[#0E4032] transition-colors">Set as default</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6">
                  {!formData.id && (
                    <button
                      type="button"
                      onClick={() => setView("select")}
                      className="px-5 py-2.5 rounded-xl font-semibold text-[#5A6B5A] hover:bg-[#F2F6EC] transition-colors"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-[#0E4032] hover:bg-[#0E4032]/90 text-white rounded-xl font-semibold shadow-[0_4px_14px_rgba(14,64,50,0.2)] transition-all hover:-translate-y-0.5"
                  >
                    {formData.id ? "Update Address" : "Save Address"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
