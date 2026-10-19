"use client"

import React, { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { cn } from '@/lib/utils'
import { Upload, File, X } from 'lucide-react'

/**
 * FileUploadDropzone
 *
 * Premium drag-and-drop upload box for KOI onboarding.
 *
 * @param {string}   label       – visible label above the dropzone
 * @param {string}   hint        – helper text (e.g. supported formats)
 * @param {Object}   file        – currently selected file { name, size } or null
 * @param {Function} onFileSelect – called with the accepted File object
 * @param {Function} onFileRemove – called to clear the current file
 * @param {Object}   accept      – react-dropzone accept map, e.g. { 'text/csv': ['.csv'] }
 * @param {number}   maxSizeMB   – max file size in megabytes
 */
export default function FileUploadDropzone({
  label,
  hint,
  file = null,
  onFileSelect,
  onFileRemove,
  accept,
  maxSizeMB = 10,
}) {
  const [dragError, setDragError] = useState(null)

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
      if (accepted.length > 0) {
        onFileSelect(accepted[0])
      }
    },
    [onFileSelect, maxSizeMB],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize: maxSizeMB * 1024 * 1024,
    multiple: false,
  })

  /* ── File preview state ───────────────── */
  if (file) {
    return (
      <div>
        {label && (
          <label className="block text-sm font-semibold text-foreground mb-1.5 tracking-tight">
            {label}
          </label>
        )}
        <div className="flex items-center justify-between bg-koi-paper border border-koi-track rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <File className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground truncate max-w-[240px]">{file.name}</p>
              <p className="text-xs text-muted">{formatSize(file.size)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFileRemove}
            className="p-1.5 rounded-lg hover:bg-background transition-colors text-muted hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  /* ── Drop zone ────────────────────────── */
  return (
    <div>
      {label && (
        <label className="block text-sm font-semibold text-foreground mb-1.5 tracking-tight">
          {label}
        </label>
      )}
      <div
        {...getRootProps()}
        className={cn(
          'relative flex flex-col items-center justify-center h-[140px] rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-koi-track bg-koi-paper hover:border-primary/40 hover:bg-koi-bg',
        )}
      >
        <input {...getInputProps()} />
        <div className="w-10 h-10 rounded-full bg-koi-track flex items-center justify-center mb-3">
          <Upload className="w-5 h-5 text-muted" />
        </div>
        <p className="text-sm text-foreground font-medium">
          Drag & drop your file here
        </p>
        <p className="text-xs text-muted mt-1">
          or{' '}
          <span className="text-primary font-medium underline underline-offset-2">
            browse files
          </span>
        </p>
      </div>
      {hint && !dragError && (
        <p className="text-xs text-muted mt-2">{hint}</p>
      )}
      {dragError && (
        <p className="text-xs text-danger mt-2 flex items-center gap-1">
          <span className="inline-block w-1 h-1 rounded-full bg-danger" />
          {dragError}
        </p>
      )}
    </div>
  )
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
