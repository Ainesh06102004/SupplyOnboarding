"use client"

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { X, ChevronDown, Search } from 'lucide-react'

/**
 * MultiSelectChipInput
 *
 * KOI's signature searchable multi-select chip selector.
 *
 * Features:
 *   ✓ Searchable dropdown with filtered suggestions
 *   ✓ Selected items rendered as removable purple pill chips
 *   ✓ Keyboard navigation (ArrowUp / ArrowDown / Enter / Escape)
 *   ✓ Click-outside-to-close
 *   ✓ Duplicate prevention
 *   ✓ Configurable max selections
 *   ✓ Empty-state messaging
 *
 * @param {string}   label          – visible label above the input
 * @param {string}   placeholder    – input placeholder text
 * @param {Array}    options        – [{ value, label }]
 * @param {Array}    selected       – array of currently selected values
 * @param {Function} onChange       – called with updated selected-values array
 * @param {number}   maxSelections  – cap on how many items can be picked
 */
export default function MultiSelectChipInput({
  label,
  placeholder = 'Search…',
  options = [],
  selected = [],
  onChange,
  maxSelections = Infinity,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)

  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  /* ── Derived state ──────────────────────────── */
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const filteredOptions = useMemo(() => {
    const q = query.toLowerCase().trim()
    return options.filter(
      (opt) => !selectedSet.has(opt.value) && opt.label.toLowerCase().includes(q),
    )
  }, [options, selectedSet, query])

  const atLimit = selected.length >= maxSelections

  /* ── Handlers ───────────────────────────────── */
  const addItem = useCallback(
    (value) => {
      if (atLimit || selectedSet.has(value)) return
      onChange([...selected, value])
      setQuery('')
      setHighlightIdx(0)
      inputRef.current?.focus()
    },
    [atLimit, selected, selectedSet, onChange],
  )

  const removeItem = useCallback(
    (value) => {
      onChange(selected.filter((v) => v !== value))
    },
    [selected, onChange],
  )

  /* ── Keyboard navigation ────────────────────── */
  const handleKeyDown = useCallback(
    (e) => {
      if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
        e.preventDefault()
        setIsOpen(true)
        return
      }

      if (!isOpen) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightIdx((i) => Math.min(i + 1, filteredOptions.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightIdx((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredOptions[highlightIdx]) {
            addItem(filteredOptions[highlightIdx].value)
          }
          break
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          break
        case 'Backspace':
          if (query === '' && selected.length > 0) {
            removeItem(selected[selected.length - 1])
          }
          break
        default:
          break
      }
    },
    [isOpen, filteredOptions, highlightIdx, addItem, query, selected, removeItem],
  )

  /* ── Scroll highlighted option into view ────── */
  useEffect(() => {
    if (!isOpen || !listRef.current) return
    const el = listRef.current.children[highlightIdx]
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, isOpen])

  /* ── Click outside to close ─────────────────── */
  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ── Reset highlight index when query changes ─ */
  useEffect(() => {
    const t = setTimeout(() => setHighlightIdx(0), 0)
    return () => clearTimeout(t)
  }, [query])

  /* ── Resolve value → label ──────────────────── */
  const labelMap = useMemo(() => {
    const m = {}
    options.forEach((o) => (m[o.value] = o.label))
    return m
  }, [options])

  /* ── Render ─────────────────────────────────── */
  return (
    <div className="w-full" ref={containerRef}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-foreground mb-1.5">
          {label}
          {maxSelections < Infinity && (
            <span className="text-muted font-normal ml-1.5">
              ({selected.length}/{maxSelections})
            </span>
          )}
        </label>
      )}

      {/* Input area */}
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="options-listbox"
        onClick={() => {
          if (!atLimit) {
            setIsOpen(true)
            inputRef.current?.focus()
          }
        }}
        className={cn(
          'relative flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 min-h-[48px] cursor-text transition-all duration-200',
          isOpen
            ? 'border-primary ring-2 ring-primary/15 shadow-sm'
            : 'border-[#E5E7EB] hover:border-primary/40',
          atLimit && 'opacity-70 cursor-default',
        )}
      >
        {/* Chips */}
        {selected.map((val) => (
          <Chip key={val} label={labelMap[val] ?? val} onRemove={() => removeItem(val)} />
        ))}

        {/* Search input */}
        {!atLimit && (
          <div className="flex items-center gap-1.5 flex-1 min-w-[120px] py-2">
            <Search className="w-3.5 h-3.5 text-muted shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setIsOpen(true)
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={selected.length === 0 ? placeholder : ''}
              className="flex-1 min-w-[120px] outline-none bg-transparent text-sm"
              disabled={disabled}
              role="combobox"
              aria-controls="options-listbox"
              aria-expanded={isOpen}
            />
          </div>
        )}

        {/* Chevron */}
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="relative z-40">
          <ul
            ref={listRef}
            role="listbox"
            className="absolute mt-2 w-full max-h-[220px] overflow-y-auto rounded-xl border border-[#E5E7EB] bg-card py-1.5"
            style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}
          >
            {filteredOptions.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted text-center">
                {query ? 'No matching options' : 'All options selected'}
              </li>
            ) : (
              filteredOptions.map((opt, idx) => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={idx === highlightIdx}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onClick={() => addItem(opt.value)}
                  className={cn(
                    'px-4 py-2.5 text-sm cursor-pointer transition-colors duration-150',
                    idx === highlightIdx
                      ? 'bg-primary/8 text-primary font-medium'
                      : 'text-foreground hover:bg-primary/5',
                  )}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────
 *  Chip - removable purple pill (internal)
 * ──────────────────────────────────────────────── */
function Chip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-9 bg-primary text-white text-sm font-medium pl-3.5 pr-2.5 rounded-full whitespace-nowrap select-none shadow-sm">
      {label}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
        aria-label={`Remove ${label}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  )
}
