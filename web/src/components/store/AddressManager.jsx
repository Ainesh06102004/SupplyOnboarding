"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, MapPin, Check, Trash2, Edit2, AlertCircle, User as UserIcon } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import LocationModal from "@/components/store/LocationModal";
import OTPLoginModal from "@/components/auth/OTPLoginModal";

export default function AddressManager({ onSelect, selectedAddressId }) {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadAddresses = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("delivery_addresses")
        .select("*")
        .eq("profile_id", user.uid)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAddresses(data || []);
      
      // Auto-select default if none selected
      if (!selectedAddressId && data?.length > 0 && onSelect) {
        onSelect(data[0]);
      }
    } catch (err) {
      console.error("Error loading addresses:", err);
      setError("Failed to load addresses.");
    } finally {
      setLoading(false);
    }
  }, [user, onSelect, selectedAddressId, setAddresses, setError, setLoading]);

  useEffect(() => {
    if (user?.uid) {
      const t = setTimeout(() => loadAddresses(), 0);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(t);
    }
  }, [user, loadAddresses, setLoading]);

  const handleSaveAddress = async (formData) => {
    if (!user?.uid) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      const payload = {
        profile_id: user.uid,
        label: formData.label,
        full_name: formData.full_name,
        phone: formData.phone,
        house_number: formData.house_number,
        street: formData.street,
        landmark: formData.landmark,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
        is_default: formData.is_default,
      };

      if (formData.id) {
        // Update
        const { error: updateError } = await supabase
          .from("delivery_addresses")
          .update(payload)
          .eq("id", formData.id)
          .eq("profile_id", user.uid);
        if (updateError) throw updateError;
      } else {
        // Insert
        const { error: insertError } = await supabase
          .from("delivery_addresses")
          .insert([payload]);
        if (insertError) throw insertError;
      }

      await loadAddresses();
      setIsModalOpen(false);
      setEditData(null);
    } catch (err) {
      console.error("Error saving address:", err);
      setError("Failed to save address. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (addr) => {
    setEditData(addr);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this address?")) return;
    try {
      const supabase = getSupabaseClient();
      await supabase
        .from("delivery_addresses")
        .delete()
        .eq("id", id)
        .eq("profile_id", user.uid);
      await loadAddresses();
    } catch (err) {
      console.error("Error deleting address:", err);
    }
  };

  const openNewForm = () => {
    setEditData(null);
    setIsModalOpen(true);
  };

  if (!user) {
    return (
      <>
        <div className="p-8 bg-[#F2F6EC] rounded-xl text-center border-2 border-dashed border-[#E2E8D8]">
          <UserIcon className="w-8 h-8 text-[#5A6B5A] mx-auto mb-3 opacity-50" />
          <p className="text-[#5A6B5A] font-medium mb-4">Please log in to manage your addresses.</p>
          <button 
            onClick={() => setIsLoginOpen(true)}
            className="px-5 py-2.5 bg-[#0E4032] text-white rounded-xl font-bold hover:bg-[#155A47] transition-colors inline-flex items-center gap-2"
          >
            Login or Signup
          </button>
        </div>
        <OTPLoginModal open={isLoginOpen} onOpenChange={setIsLoginOpen} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>Delivery Addresses</h3>
        <button
          onClick={openNewForm}
          className="flex items-center gap-2 text-sm font-semibold text-[#0E4032] hover:bg-[#EDF2E6] px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add New
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-[#C94B40]/10 text-[#C94B40] rounded-xl text-sm font-medium">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-24 bg-[#E2E8D8] rounded-xl"></div>
          <div className="h-24 bg-[#E2E8D8] rounded-xl"></div>
        </div>
      ) : addresses.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-[#E2E8D8] rounded-xl">
          <MapPin className="w-8 h-8 text-[#5A6B5A] mx-auto mb-2 opacity-50" />
          <p className="text-[#5A6B5A]">No saved addresses found.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.map((addr) => {
            const isSelected = selectedAddressId === addr.id;
            return (
              <div
                key={addr.id}
                className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  isSelected
                    ? "border-[#0E4032] bg-[#F2F6EC]"
                    : "border-[#E2E8D8] bg-white hover:border-[#0E4032]/30"
                }`}
                onClick={() => onSelect && onSelect(addr)}
              >
                {isSelected && (
                  <div className="absolute top-4 right-4 text-[#0E4032]">
                    <Check className="w-5 h-5" />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-[#EDF2E6] text-[#0E4032] rounded">
                    {addr.label}
                  </span>
                  {addr.is_default && (
                    <span className="text-xs font-semibold text-[#5A6B5A]">Default</span>
                  )}
                </div>
                <div className="text-sm space-y-1 text-[#5A6B5A] pr-8">
                  <p className="font-bold text-[#0E4032]">{addr.full_name}</p>
                  <p>{addr.house_number ? `${addr.house_number}, ` : ""}{addr.street}</p>
                  {addr.landmark && <p>Landmark: {addr.landmark}</p>}
                  <p>
                    {addr.city}, {addr.state} {addr.pincode}
                  </p>
                  <p>Phone: {addr.phone}</p>
                </div>
                
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#E2E8D8]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(addr);
                    }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#5A6B5A] hover:text-[#0E4032] transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(addr.id);
                    }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#C94B40] hover:opacity-80 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reusable Location Modal in Delivery Mode */}
      <LocationModal 
        mode="delivery"
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onComplete={handleSaveAddress}
        initialData={editData}
      />
    </div>
  );
}
