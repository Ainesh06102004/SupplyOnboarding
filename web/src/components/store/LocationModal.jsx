"use client";

import { useState, useEffect, useRef } from "react";
import { MapPin, Navigation, Search, X, AlertCircle } from "lucide-react";
import { locationService } from "@/lib/locationService";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";

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

  // The room dims and the sheet rises (a bottom sheet on phones).
  const layerRef = useRef(null);
  useGSAP(() => {
    const layer = layerRef.current;
    if (!open || !layer || prefersReducedMotion()) return;
    const gsap = setupMotion();
    gsap.from(layer.querySelector("[data-backdrop]"), { autoAlpha: 0, duration: 0.3, ease: "power1.out" });
    gsap.from(layer.querySelector("[data-sheet]"), { y: 48, autoAlpha: 0, scale: 0.97, duration: 0.55, ease: E.reveal });
  }, { dependencies: [open] });

  if (!open) return null;

  return (
    <div ref={layerRef} role="dialog" aria-modal="true" aria-label={view === "select" ? (mode === "store" ? "Select your location" : "Find your address") : "Address details"} className="fixed inset-0 z-50 flex items-end justify-center p-0 font-koi-sans text-koi-ink md:items-center md:p-4">
      <div data-backdrop aria-hidden="true" onClick={() => onOpenChange(false)} className="absolute inset-0 bg-koi-night/45 backdrop-blur-[3px]" />
      <div data-sheet className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-[32px] bg-koi-bg shadow-[0_50px_120px_-40px_rgba(4,20,15,.75)] md:max-w-[520px] md:rounded-[32px]">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-full text-koi-ink2 transition-colors hover:bg-white"
        >
          <X className="w-5 h-5" />
        </button>

        {view === "select" ? (
          <div className="flex flex-col">
            <div className="px-7 pb-2 pt-7">
              <h2 className="koi-condensed m-0 mb-2 pr-10 font-koi-display text-[34px] font-extrabold leading-none tracking-[-0.02em] text-koi-forest">
                {mode === "store" ? "Select your location" : "Find your address"}
              </h2>
              <p className="text-koi-muted text-sm">
                {mode === "store" 
                  ? "To see accurate availability and delivery times" 
                  : "We'll use this to prefill your delivery details"}
              </p>
            </div>

            <div className="space-y-4 px-7 pb-7 pt-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-koi-red/10 text-koi-red rounded-xl text-sm font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleDetectLocation}
                disabled={isDetecting}
                className="flex w-full items-center justify-between rounded-2xl bg-koi-forest p-4 text-koi-bg transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-full bg-koi-lime text-koi-forest">
                    <Navigation className={`size-4 ${isDetecting ? 'animate-pulse' : ''}`} />
                  </div>
                  <div className="text-left">
                    <span className="block font-bold text-sm">
                      {isDetecting ? "Detecting..." : "Use current location"}
                    </span>
                    <span className="block text-xs text-koi-bg/70">Enable GPS for precise delivery</span>
                  </div>
                </div>
              </button>

              <div className="relative flex items-center gap-4 py-2">
                <div className="flex-1 h-px bg-koi-forest/10"></div>
                <span className="text-xs font-semibold uppercase tracking-wider text-koi-muted">Or</span>
                <div className="flex-1 h-px bg-koi-forest/10"></div>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-koi-muted" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search by area, locality, or pincode"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-14 w-full rounded-2xl border-2 border-koi-forest/15 bg-white pl-10 pr-4 text-[15px] font-medium outline-none placeholder:text-koi-muted focus:border-koi-forest"
                />
              </div>

              {(searchQuery.trim().length >= 3 || isSearching) && (
                <div className="max-h-[250px] overflow-y-auto rounded-xl border border-koi-forest/10 bg-white divide-y divide-koi-forest/10 shadow-inner">
                  {isSearching ? (
                    <div className="px-4 py-6 text-center text-koi-muted text-sm animate-pulse">
                      Searching...
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => processSelectedLocation(c)}
                        className="w-full text-left px-4 py-3 hover:bg-koi-bg flex items-start gap-3 transition-colors"
                      >
                        <MapPin className="w-4 h-4 text-koi-muted mt-0.5 shrink-0" />
                        <div>
                          <span className="block text-sm font-semibold text-koi-ink line-clamp-1">{c.display_name}</span>
                          <span className="block text-xs text-koi-muted">
                            {c.city && `${c.city}, `}{c.state} {c.pincode}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-koi-muted text-sm">
                      No locations found matching &quot;{searchQuery}&quot;
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="px-7 pb-2 pt-7">
              <h2 className="koi-condensed m-0 mb-2 pr-10 font-koi-display text-[34px] font-extrabold leading-none tracking-[-0.02em] text-koi-forest">
                {formData.id ? "Edit Address" : "Complete Address"}
              </h2>
              <p className="text-koi-muted text-sm">
                Verify and add missing details
              </p>
            </div>

            <div className="px-7 pb-7 pt-4">
              <form onSubmit={handleSubmitDetails} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-koi-ink uppercase tracking-wider">Full Name</label>
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 bg-white border border-koi-forest/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-koi-ink uppercase tracking-wider">Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 bg-white border border-koi-forest/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest/40"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-koi-ink uppercase tracking-wider">House / Flat No.</label>
                    <input
                      type="text"
                      name="house_number"
                      value={formData.house_number}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 bg-white border border-koi-forest/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-koi-ink uppercase tracking-wider">Landmark</label>
                    <input
                      type="text"
                      name="landmark"
                      value={formData.landmark}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-white border border-koi-forest/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest/40 placeholder:text-koi-muted/40"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-koi-ink uppercase tracking-wider">Street / Area</label>
                  <input
                    type="text"
                    name="street"
                    value={formData.street}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 bg-white border border-koi-forest/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-koi-forest/20 focus:border-koi-forest/40"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4 bg-koi-bg p-3 rounded-xl border border-koi-forest/10">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-koi-muted uppercase tracking-wider">City</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      required
                      className="w-full bg-transparent text-sm font-semibold text-koi-ink focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-koi-muted uppercase tracking-wider">State</label>
                    <input
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      required
                      className="w-full bg-transparent text-sm font-semibold text-koi-ink focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-koi-muted uppercase tracking-wider">Pincode</label>
                    <input
                      type="text"
                      name="pincode"
                      value={formData.pincode}
                      onChange={handleChange}
                      required
                      className="w-full bg-transparent text-sm font-semibold text-koi-ink focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-3">
                    <select
                      name="label"
                      value={formData.label}
                      onChange={handleChange}
                      className="bg-koi-bg text-koi-ink border border-koi-forest/10 rounded-lg px-2 py-1.5 text-xs font-bold uppercase cursor-pointer outline-none focus:ring-2 focus:ring-koi-forest/20"
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
                          className="peer appearance-none w-4 h-4 border-2 border-koi-forest/10 rounded bg-white checked:bg-koi-forest checked:border-koi-forest cursor-pointer transition-colors"
                        />
                        <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="11.667 3.5 5.25 9.917 2.333 7"></polyline>
                        </svg>
                      </div>
                      <span className="text-sm font-semibold text-koi-muted group-hover:text-koi-ink transition-colors">Set as default</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6">
                  {!formData.id && (
                    <button
                      type="button"
                      onClick={() => setView("select")}
                      className="px-5 py-2.5 rounded-xl font-semibold text-koi-muted hover:bg-koi-bg transition-colors"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="submit"
                    className="h-12 rounded-2xl bg-koi-forest px-6 font-bold text-koi-lime transition-transform hover:-translate-y-0.5"
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
