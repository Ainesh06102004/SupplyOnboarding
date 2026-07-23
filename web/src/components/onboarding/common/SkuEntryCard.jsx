"use client"

import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, Upload, Link2, File, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useDropzone } from 'react-dropzone'

const INPUT_CLASS =
  'h-12 rounded-xl border-[#E5E7EB] bg-[#FDFCFA] px-4 text-sm placeholder:text-muted/60 hover:border-[#C9C1B6] focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200'

/**
 * SkuEntryCard
 *
 * Collapsible card for entering a single SKU's details.
 * Each card has Product Name + Nutrition Label + Ingredient Label.
 * Label fields support a tab toggle between file upload and URL paste.
 *
 * @param {number}   index      – 0-indexed SKU number
 * @param {Object}   data       – { productName, nutritionLabel, ingredientLabel }
 * @param {Function} onChange   – (field, value) => void
 * @param {Object}   errors     – { productName?, nutritionLabel?, ingredientLabel? }
 * @param {boolean}  defaultOpen
 */
export default function SkuEntryCard({
  index,
  data = {},
  onChange,
  errors = {},
  defaultOpen = false,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const skuNum = index + 1

  return (
    <div className="border border-[#E5E7EB] rounded-xl overflow-hidden bg-card transition-all">
      {/* Collapse header */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#FDFCFA] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
            {skuNum}
          </span>
          <span className="text-sm font-semibold text-foreground">
            {data.productName?.trim() || `Product ${skuNum}`}
          </span>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Body */}
      {isOpen && (
        <div className="px-5 pb-5 pt-1 space-y-5 border-t border-[#E5E7EB]">
          {/* Product Name */}
          <div>
            <label className="block text-[13px] font-semibold text-foreground mb-1.5 tracking-tight">
              Product Name <span className="text-danger">*</span>
            </label>
            <Input
              placeholder="e.g. Crunchy Protein Bar - Dark Cocoa"
              value={data.productName || ''}
              onChange={(e) => onChange('productName', e.target.value)}
              className={INPUT_CLASS}
            />
            {errors.productName && <InlineError message={errors.productName} />}
          </div>

          {/* Nutrition Label */}
          <LabelUploadField
            label="Nutrition Label"
            required
            fileValue={data.nutritionLabelFile}
            linkValue={data.nutritionLabelLink || ''}
            onFileChange={(f) => onChange('nutritionLabelFile', f)}
            onLinkChange={(v) => onChange('nutritionLabelLink', v)}
            error={errors.nutritionLabel}
          />

          {/* Ingredient Label */}
          <LabelUploadField
            label="Ingredient Label"
            required
            fileValue={data.ingredientLabelFile}
            linkValue={data.ingredientLabelLink || ''}
            onFileChange={(f) => onChange('ingredientLabelFile', f)}
            onLinkChange={(v) => onChange('ingredientLabelLink', v)}
            error={errors.ingredientLabel}
          />
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────
 *  LabelUploadField - tab switch between Upload / Paste Link
 * ──────────────────────────────────────────────── */
function LabelUploadField({
  label,
  required,
  fileValue,
  linkValue,
  onFileChange,
  onLinkChange,
  error,
}) {
  const [mode, setMode] = useState('upload') // 'upload' | 'link'

  const onDrop = (accepted) => {
    if (accepted.length > 0) onFileChange(accepted[0])
  }

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[13px] font-semibold text-foreground tracking-tight">
          {label} {required && <span className="text-danger">*</span>}
        </label>

        {/* Tab toggle */}
        <div className="flex items-center bg-[#F0EBE3] rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={cn(
              'flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-all',
              mode === 'upload'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted hover:text-foreground',
            )}
          >
            <Upload className="w-3 h-3" />
            Upload File
          </button>
          <button
            type="button"
            onClick={() => setMode('link')}
            className={cn(
              'flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-all',
              mode === 'link'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted hover:text-foreground',
            )}
          >
            <Link2 className="w-3 h-3" />
            Paste Link
          </button>
        </div>
      </div>

      {mode === 'upload' ? (
        fileValue ? (
          <div className="flex items-center justify-between bg-[#FDFCFA] border border-[#E5E7EB] rounded-xl px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <File className="w-4 h-4 text-primary" />
              <span className="text-sm text-foreground truncate max-w-[200px]">
                {fileValue.name}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onFileChange(null)}
              className="p-1 rounded-md hover:bg-background text-muted hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div
            {...getRootProps()}
            className="flex items-center justify-center h-[52px] rounded-xl border border-dashed border-[#D9D2C8] bg-[#FDFCFA] cursor-pointer hover:border-primary/40 transition-colors"
          >
            <input {...getInputProps()} />
            <span className="text-xs text-muted">
              Drop file or{' '}
              <span className="text-primary font-medium">browse</span>
            </span>
          </div>
        )
      ) : (
        <Input
          placeholder="https://drive.google.com/…"
          value={linkValue}
          onChange={(e) => onLinkChange(e.target.value)}
          className={INPUT_CLASS}
        />
      )}

      {error && <InlineError message={error} />}
    </div>
  )
}

/* ── InlineError ────────────────────────── */
function InlineError({ message }) {
  return (
    <p className="text-xs text-danger mt-1.5 flex items-center gap-1">
      <span className="inline-block w-1 h-1 rounded-full bg-danger" />
      {message}
    </p>
  )
}
