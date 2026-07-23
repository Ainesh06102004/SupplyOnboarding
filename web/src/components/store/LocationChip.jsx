"use client";

import { useState } from "react";
import { MapPin, ChevronDown } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import LocationModal from "./LocationModal";

export default function LocationChip() {
  const { location, loading, setLocation } = useLocation();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center justify-between w-full md:w-auto gap-3 text-sm font-medium px-4 py-2.5 md:py-2 rounded-xl bg-white border border-[#E2E8D8] hover:bg-[#F2F6EC] transition-colors shrink-0 shadow-sm"
        style={{ color: "#0E4032" }}
      >
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          <div className="text-left">
            <span className="block text-[9px] uppercase tracking-wider opacity-70 leading-none mb-0.5">
              Delivering to
            </span>
            <span className="block leading-none font-bold">
              {loading ? "Loading..." : location?.city || "Select Location"}
            </span>
          </div>
        </div>
        <ChevronDown className="w-4 h-4 opacity-50 ml-1" />
      </button>

      <LocationModal 
        mode="store"
        open={modalOpen} 
        onOpenChange={setModalOpen}
        onComplete={(loc) => setLocation(loc)}
      />
    </>
  );
}
