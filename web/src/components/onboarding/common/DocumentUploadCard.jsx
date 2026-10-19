"use client"

import React, { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { cn } from '@/lib/utils'
import {
  Upload,
  File,
  X,
  CheckCircle2,
  Link2,
  Plus,
  FileText,
} from 'lucide-react'
import { Input } from '@/components/ui/input'

/* ────────────────────────────────────────────────
 *  DocumentUploadCard
 *
 *  Reusable upload card for compliance documents.
 *
 *  uploadMode:
 *    "file"         → drag-drop only
 *    "file_or_link"  → tabs: [Upload Files] [Paste Links]
 * ──────────────────────────────────────────────── */
export default function DocumentUploadCard({
  title,
  description,
  required = false,
  allowMultiple = false,
  acceptedFormats = ['application/pdf', 'image/jpeg', 'image/png'],
  uploadMode = 'file',          // "file" | "file_or_link"
  maxSizeMB = 10,
  files = [],
  links = [],
  onFilesChange,
  onLinksChange,
  error,
}) {
  const [activeTab, setActiveTab] = useState('upload')
  const [dragError, setDragError] = useState(null)

  /* ── Build react-dropzone accept map ──── */
  const acceptMap = buildAcceptMap(acceptedFormats)
  const formatLabel = buildFormatLabel(acceptedFormats)

  /* ── Drop handler ───────────────────────── */
  const onDrop = useCallback(
    (accepted, rejected) => {
      setDragError(null)

      if (rejected.length > 0) {
        const err = rejected[0].errors[0]
        if (err.code === 'file-too-large') {
          setDragError(`File must be under ${maxSizeMB}MB`)
        } else if (err.code === 'file-invalid-type') {
          setDragError('Unsupported file type')
        } else {
          setDragError(err.message)
        }
        return
      }

      if (accepted.length === 0) return

      if (allowMultiple) {
        onFilesChange([...files, ...accepted])
      } else {
        onFilesChange([accepted[0]])
      }
    },
    [files, onFilesChange, allowMultiple, maxSizeMB],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptMap,
    maxSize: maxSizeMB * 1024 * 1024,
    multiple: allowMultiple,
  })

  const removeFile = useCallback(
    (idx) => {
      onFilesChange(files.filter((_, i) => i !== idx))
    },
    [files, onFilesChange],
  )

  /* ── Link helpers ───────────────────────── */
  const addLink = useCallback(() => {
    onLinksChange([...links, ''])
  }, [links, onLinksChange])

  const updateLink = useCallback(
    (idx, value) => {
      const next = [...links]
      next[idx] = value
      onLinksChange(next)
    },
    [links, onLinksChange],
  )

  const removeLink = useCallback(
    (idx) => {
      onLinksChange(links.filter((_, i) => i !== idx))
    },
    [links, onLinksChange],
  )

  /* ── Render ─────────────────────────────── */
  const showTabs = uploadMode === 'file_or_link'

  return (
    <section
      className="overflow-hidden rounded-[26px] border border-koi-forest/10 bg-white"
    >
      {/* Header */}
      <div className="px-7 pt-6 pb-0 md:px-8 md:pt-7">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-koi-primary/8 text-koi-primary flex items-center justify-center shrink-0">
              <FileText className="w-[18px] h-[18px]" strokeWidth={2} />
            </div>
            <div className="pt-0.5">
              <h2 className="text-[17px] font-koi-display font-bold text-koi-ink tracking-tight leading-tight">
                {title}
              </h2>
              {description && (
                <p className="text-[13px] text-koi-muted mt-0.5 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>
          <RequiredBadge required={required} />
        </div>
      </div>

      {/* Tabs (only for file_or_link mode) */}
      {showTabs && (
        <div className="px-7 md:px-8 pt-4">
          <div className="inline-flex rounded-lg bg-koi-track p-1 gap-0.5">
            <TabButton
              active={activeTab === 'upload'}
              onClick={() => setActiveTab('upload')}
              icon={Upload}
              label="Upload Files"
            />
            <TabButton
              active={activeTab === 'links'}
              onClick={() => setActiveTab('links')}
              icon={Link2}
              label="Paste Links"
            />
          </div>
        </div>
      )}

      {/* Body */}
      <div className="px-7 pt-5 pb-7 md:px-8 md:pb-8">
        {/* Upload tab / default */}
        {(activeTab === 'upload' || !showTabs) && (
          <>
            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-2 mb-4">
                {files.map((file, idx) => (
                  <FileRow key={`${file.name}-${idx}`} file={file} onRemove={() => removeFile(idx)} />
                ))}
              </div>
            )}

            {/* Show dropzone if no files or allowMultiple */}
            {(files.length === 0 || allowMultiple) && (
              <div
                {...getRootProps()}
                className={cn(
                  'relative flex flex-col items-center justify-center h-[140px] rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200',
                  isDragActive
                    ? 'border-koi-primary bg-koi-primary/5'
                    : 'border-koi-track bg-koi-paper hover:border-koi-primary/40 hover:bg-koi-bg',
                )}
              >
                <input {...getInputProps()} />
                <div className="w-10 h-10 rounded-full bg-koi-track flex items-center justify-center mb-3">
                  <Upload className="w-5 h-5 text-koi-muted" />
                </div>
                <p className="text-sm text-koi-ink font-medium">
                  Drag & drop your file{allowMultiple ? 's' : ''} here
                </p>
                <p className="text-xs text-koi-muted mt-1">
                  or{' '}
                  <span className="text-koi-primary font-medium underline underline-offset-2">
                    browse files
                  </span>
                </p>
              </div>
            )}

            <p className="text-xs text-koi-muted mt-2">
              Supported: {formatLabel} · Max {maxSizeMB}MB
              {allowMultiple ? ' each' : ''}
            </p>

            {dragError && (
              <p className="text-xs text-koi-red mt-1.5 flex items-center gap-1">
                <span className="inline-block w-1 h-1 rounded-full bg-koi-red" />
                {dragError}
              </p>
            )}
          </>
        )}

        {/* Links tab */}
        {showTabs && activeTab === 'links' && (
          <div className="space-y-3">
            {links.map((link, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  placeholder="https://pubmed.ncbi.nlm.nih.gov/..."
                  value={link}
                  onChange={(e) => updateLink(idx, e.target.value)}
                  className="h-11 rounded-xl border-koi-forest/15 bg-koi-paper px-4 text-sm placeholder:text-koi-muted hover:border-koi-forest/30 focus:border-koi-forest focus:bg-white focus-visible:ring-4 focus-visible:ring-koi-lime/30 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => removeLink(idx)}
                  className="p-2 rounded-lg hover:bg-background transition-colors text-koi-muted hover:text-koi-ink shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addLink}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-koi-primary hover:text-koi-primary/80 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add link
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-koi-red mt-2 flex items-center gap-1">
            <span className="inline-block w-1 h-1 rounded-full bg-koi-red" />
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────
 *  Internal sub-components
 * ──────────────────────────────────────────────── */

function RequiredBadge({ required }) {
  return (
    <span
      className={cn(
        'text-[11px] font-semibold tracking-wide px-2.5 py-1 rounded-full shrink-0 mt-1',
        required
          ? 'bg-koi-red/10 text-koi-red'
          : 'bg-koi-track text-koi-muted',
      )}
    >
      {required ? 'Required' : 'Optional'}
    </span>
  )
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-semibold rounded-md transition-all duration-200',
        active
          ? 'bg-white text-koi-ink shadow-sm'
          : 'text-koi-muted hover:text-koi-ink',
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function FileRow({ file, onRemove }) {
  return (
    <div className="flex items-center justify-between bg-koi-paper border border-koi-track rounded-xl px-4 py-3 group">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-koi-primary/10 text-koi-primary flex items-center justify-center shrink-0">
          <File className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-koi-ink truncate max-w-[260px]">
            {file.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-koi-muted">{formatSize(file.size)}</p>
            <span className="flex items-center gap-1 text-xs text-koi-green">
              <CheckCircle2 className="w-3 h-3" />
              Uploaded
            </span>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 rounded-lg hover:bg-background transition-colors text-koi-muted hover:text-koi-ink opacity-0 group-hover:opacity-100"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

/* ── Utility helpers ─────────────────────────── */

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function buildAcceptMap(formats) {
  const map = {}
  for (const f of formats) {
    if (f === 'application/pdf' || f === 'pdf') map['application/pdf'] = ['.pdf']
    if (f === 'image/jpeg' || f === 'jpg') map['image/jpeg'] = ['.jpg', '.jpeg']
    if (f === 'image/png' || f === 'png') map['image/png'] = ['.png']
  }
  return map
}

function buildFormatLabel(formats) {
  const labels = []
  for (const f of formats) {
    if (f === 'application/pdf' || f === 'pdf') labels.push('PDF')
    if (f === 'image/jpeg' || f === 'jpg') labels.push('JPG')
    if (f === 'image/png' || f === 'png') labels.push('PNG')
  }
  return [...new Set(labels)].join(', ')
}
