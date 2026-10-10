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
        const t = setTimeout(() => {
          setFormData(initialData);
          setView("details");
        }, 0);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => {
          setView("select");
          setFormData({
            id: null, label: "Home", full_name: "", phone: "",
            house_number: "", street: "", landmark: "", city: "",
            state: "", pincode: "", country: "India", is_default: false,
            lat: null, lon: null
          });
          setSearchQuery("");
          setSearchResults([]);
        }, 0);
        return () => clearTimeout(t);
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
      <div className="relative w-full max-w-[500px] max-h-[90vh] overflow-y-auto bg-white border border-[#e7e5de] shadow-2xl rounded-2xl animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 p-1.5 text-[#6b6f63] hover:bg-[#e7e5de] rounded-full transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {view === "select" ? (
          <div className="flex flex-col">
            <div className="p-6 pb-4 bg-[#f6f5f1] border-b border-[#e7e5de]">
              <h2 className="text-xl font-bold text-[#1c1e17] mb-1">
                {mode === "store" ? "Select your location" : "Find your address"}
              </h2>
              <p className="text-[#6b6f63] text-sm">
                {mode === "store" 
                  ? "To see accurate availability and delivery times" 
                  : "We'll use this to prefill your delivery details"}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-[#b84535]/10 text-[#b84535] rounded-xl text-sm font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleDetectLocation}
                disabled={isDetecting}
                className="w-full flex items-center justify-between p-4 bg-white border border-[#e7e5de] rounded-xl text-[#1c1e17] hover:bg-[#EDF2E6] hover:border-[#1f5c3a]/30 transition-all shadow-sm disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1f5c3a]/10 flex items-center justify-center">
                    <Navigation className={`w-4 h-4 text-[#1c1e17] ${isDetecting ? 'animate-pulse' : ''}`} />
                  </div>
                  <div className="text-left">
                    <span className="block font-bold text-sm">
                      {isDetecting ? "Detecting..." : "Use current location"}
                    </span>
                    <span className="block text-xs text-[#6b6f63]">Enable GPS for precise delivery</span>
                  </div>
                </div>
              </button>

              <div className="relative flex items-center gap-4 py-2">
                <div className="flex-1 h-px bg-[#e7e5de]"></div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#6b6f63]">Or</span>
                <div className="flex-1 h-px bg-[#e7e5de]"></div>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b6f63]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search by area, locality, or pincode"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-[#e7e5de] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1f5c3a]/20 focus:border-[#1f5c3a]/40 placeholder:text-[#6b6f63]/60 shadow-sm"
                />
              </div>

              {(searchQuery.trim().length >= 3 || isSearching) && (
                <div className="max-h-[250px] overflow-y-auto rounded-xl border border-[#e7e5de] bg-white divide-y divide-[#e7e5de] shadow-inner">
                  {isSearching ? (
                    <div className="px-4 py-6 text-center text-[#6b6f63] text-sm animate-pulse">
                      Searching...
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => processSelectedLocation(c)}
                        className="w-full text-left px-4 py-3 hover:bg-[#f6f5f1] flex items-start gap-3 transition-colors"
                      >
                        <MapPin className="w-4 h-4 text-[#6b6f63] mt-0.5 shrink-0" />
                        <div>
                          <span className="block text-sm font-semibold text-[#1c1e17] line-clamp-1">{c.display_name}</span>
                          <span className="block text-xs text-[#6b6f63]">
                            {c.city && `${c.city}, `}{c.state} {c.pincode}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-[#6b6f63] text-sm">
                      No locations found matching &quot;{searchQuery}&quot;
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="p-6 pb-4 bg-[#f6f5f1] border-b border-[#e7e5de]">
              <h2 className="text-xl font-bold text-[#1c1e17] mb-1">
                {formData.id ? "Edit Address" : "Complete Address"}
              </h2>
              <p className="text-[#6b6f63] text-sm">
                Verify and add missing details
              </p>
            </div>

            <div className="p-6">
              <form onSubmit={handleSubmitDetails} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#1c1e17] uppercase tracking-wider">Full Name</label>
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 bg-white border border-[#e7e5de] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1f5c3a]/20 focus:border-[#1f5c3a]/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#1c1e17] uppercase tracking-wider">Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 bg-white border border-[#e7e5de] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1f5c3a]/20 focus:border-[#1f5c3a]/40"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#1c1e17] uppercase tracking-wider">House / Flat No.</label>
                    <input
                      type="text"
                      name="house_number"
                      value={formData.house_number}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 bg-white border border-[#e7e5de] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1f5c3a]/20 focus:border-[#1f5c3a]/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#1c1e17] uppercase tracking-wider">Landmark</label>
                    <input
                      type="text"
                      name="landmark"
                      value={formData.landmark}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-white border border-[#e7e5de] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1f5c3a]/20 focus:border-[#1f5c3a]/40 placeholder:text-[#6b6f63]/40"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1c1e17] uppercase tracking-wider">Street / Area</label>
                  <input
                    type="text"
                    name="street"
                    value={formData.street}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 bg-white border border-[#e7e5de] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1f5c3a]/20 focus:border-[#1f5c3a]/40"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4 bg-[#f6f5f1] p-3 rounded-xl border border-[#e7e5de]">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#6b6f63] uppercase tracking-wider">City</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      required
                      className="w-full bg-transparent text-sm font-semibold text-[#1c1e17] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#6b6f63] uppercase tracking-wider">State</label>
                    <input
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      required
                      className="w-full bg-transparent text-sm font-semibold text-[#1c1e17] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#6b6f63] uppercase tracking-wider">Pincode</label>
                    <input
                      type="text"
                      name="pincode"
                      value={formData.pincode}
                      onChange={handleChange}
                      required
                      className="w-full bg-transparent text-sm font-semibold text-[#1c1e17] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-3">
                    <select
                      name="label"
                      value={formData.label}
                      onChange={handleChange}
                      className="bg-[#f6f5f1] text-[#1c1e17] border border-[#e7e5de] rounded-lg px-2 py-1.5 text-xs font-bold uppercase cursor-pointer outline-none focus:ring-2 focus:ring-[#1f5c3a]/20"
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
                          className="peer appearance-none w-4 h-4 border-2 border-[#e7e5de] rounded bg-white checked:bg-[#1f5c3a] checked:border-[#1f5c3a] cursor-pointer transition-colors"
                        />
                        <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="11.667 3.5 5.25 9.917 2.333 7"></polyline>
                        </svg>
                      </div>
                      <span className="text-sm font-semibold text-[#6b6f63] group-hover:text-[#1c1e17] transition-colors">Set as default</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6">
                  {!formData.id && (
                    <button
                      type="button"
                      onClick={() => setView("select")}
                      className="px-5 py-2.5 rounded-xl font-semibold text-[#6b6f63] hover:bg-[#f6f5f1] transition-colors"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-[#1f5c3a] hover:bg-[#1f5c3a]/90 text-white rounded-xl font-semibold shadow-[0_4px_14px_rgba(14,64,50,0.2)] transition-all hover:-translate-y-0.5"
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
