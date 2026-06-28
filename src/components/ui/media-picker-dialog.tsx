"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Film, Music, Image as ImageIcon, CloudUpload, Check, Search, X } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogClose } from "./dialog"
import { Button } from "./button"
import axiosInstance from "@/lib/axios"

// ── Types ────────────────────────────────────────────────────────────────────

type MediaType = "image" | "video" | "audio"
type TabId = "library" | "upload"
type TypeFilter = MediaType | "all"

export interface MediaItem {
  id: string
  type: MediaType
  url: string
  prompt: string | null
  model: string | null
  createdAt: string
}

interface MediaResponse {
  items: MediaItem[]
  total: number
}

interface UploadEntry {
  id: string
  name: string
  progress: number
  status: "uploading" | "done" | "error"
  item?: MediaItem
  error?: string
}

export interface MediaPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Restrict which media types can be selected and uploaded. Defaults to all. */
  accept?: MediaType[]
  onSelect: (item: MediaItem) => void
  title?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ICON: Record<MediaType, React.ReactNode> = {
  image: <ImageIcon className="w-4 h-4" />,
  video: <Film className="w-4 h-4" />,
  audio: <Music className="w-4 h-4" />,
}

const COLOR: Record<MediaType, string> = {
  image: "text-violet-400",
  video: "text-blue-400",
  audio: "text-emerald-400",
}

const MIME: Record<MediaType, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/mpeg"],
  audio: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/flac", "audio/aac"],
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MediaThumb({ item, selected, onClick }: { item: MediaItem; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative group rounded-xl overflow-hidden border-2 transition-all w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-white/10 hover:border-white/30"
      )}
    >
      <div className="aspect-square bg-white/5 flex flex-col items-center justify-center">
        {item.type === "image" ? (
          <Image
            src={item.url}
            alt={item.prompt ?? "media"}
            width={160}
            height={160}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          <>
            <span className={cn("mb-1.5", COLOR[item.type])}>
              {item.type === "video" ? <Film className="w-8 h-8" /> : <Music className="w-8 h-8" />}
            </span>
            <span className="text-[10px] text-gray-500 px-2 text-center line-clamp-2 leading-snug">
              {item.prompt ?? item.type}
            </span>
          </>
        )}
      </div>

      {/* Type badge */}
      <div className={cn("absolute top-1.5 left-1.5 flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm", COLOR[item.type])}>
        {ICON[item.type]}
      </div>

      {/* Selected checkmark */}
      {selected && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-lg">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
    </button>
  )
}

function UploadRow({ entry }: { entry: UploadEntry }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-white/4 border border-white/8">
      <div className={cn("shrink-0", entry.status === "done" ? "text-emerald-400" : entry.status === "error" ? "text-red-400" : "text-gray-400")}>
        {entry.status === "done" ? (
          <Check className="w-4 h-4" />
        ) : entry.status === "error" ? (
          <X className="w-4 h-4" />
        ) : (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 truncate">{entry.name}</p>
        {entry.status === "uploading" && (
          <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-200"
              style={{ width: `${entry.progress}%` }}
            />
          </div>
        )}
        {entry.status === "error" && (
          <p className="text-[10px] text-red-400 mt-0.5">{entry.error}</p>
        )}
        {entry.status === "done" && (
          <p className="text-[10px] text-emerald-400 mt-0.5">Saved to library</p>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function MediaPickerDialog({
  open,
  onOpenChange,
  accept = ["image", "video", "audio"],
  onSelect,
  title = "Select Media",
}: MediaPickerDialogProps) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<TabId>("library")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<MediaItem | null>(null)
  const [uploads, setUploads] = useState<UploadEntry[]>([])
  const [dragging, setDragging] = useState(false)

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTab("library")
      setTypeFilter("all")
      setSearch("")
      setSelected(null)
      setUploads([])
      setDragging(false)
    }
  }, [open])

  // ── Library queries ──

  const imageQ = useQuery<MediaResponse>({
    queryKey: ["media", "image"],
    queryFn: async () => (await axiosInstance.get("/media?tab=image&limit=100")).data,
    staleTime: 60_000,
    enabled: open && accept.includes("image"),
  })
  const videoQ = useQuery<MediaResponse>({
    queryKey: ["media", "video"],
    queryFn: async () => (await axiosInstance.get("/media?tab=video&limit=100")).data,
    staleTime: 60_000,
    enabled: open && accept.includes("video"),
  })
  const audioQ = useQuery<MediaResponse>({
    queryKey: ["media", "audio"],
    queryFn: async () => (await axiosInstance.get("/media?tab=audio&limit=100")).data,
    staleTime: 60_000,
    enabled: open && accept.includes("audio"),
  })

  const isLoading = imageQ.isLoading || videoQ.isLoading || audioQ.isLoading

  const allItems = useMemo(() => {
    const items: MediaItem[] = [
      ...(accept.includes("image") ? (imageQ.data?.items ?? []) : []),
      ...(accept.includes("video") ? (videoQ.data?.items ?? []) : []),
      ...(accept.includes("audio") ? (audioQ.data?.items ?? []) : []),
    ]
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return items
  }, [accept, imageQ.data, videoQ.data, audioQ.data])

  const filtered = useMemo(() => {
    let items = typeFilter === "all" ? allItems : allItems.filter(i => i.type === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(i => i.prompt?.toLowerCase().includes(q))
    }
    return items
  }, [allItems, typeFilter, search])

  // ── Upload logic ──

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files)
    const allowed = accept.flatMap(t => MIME[t])

    for (const file of arr) {
      if (!allowed.includes(file.type)) continue

      const entryId = crypto.randomUUID()
      setUploads(prev => [...prev, { id: entryId, name: file.name, progress: 0, status: "uploading" }])

      const fd = new FormData()
      fd.append("file", file)

      try {
        const { data } = await axiosInstance.post<MediaItem>("/media", fd, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0
            setUploads(prev => prev.map(u => u.id === entryId ? { ...u, progress: pct } : u))
          },
        })

        setUploads(prev => prev.map(u => u.id === entryId ? { ...u, status: "done", progress: 100, item: data } : u))
        setSelected(data)
        qc.invalidateQueries({ queryKey: ["media", data.type] })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed"
        setUploads(prev => prev.map(u => u.id === entryId ? { ...u, status: "error", error: msg } : u))
      }
    }
  }, [accept, qc])

  // ── Drag handlers ──

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])
  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
  }, [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    uploadFiles(e.dataTransfer.files)
  }, [uploadFiles])

  // ── Confirm ──

  function handleAdd() {
    if (!selected) return
    onSelect(selected)
    onOpenChange(false)
  }

  const acceptAttr = accept.flatMap(t => MIME[t]).join(",")
  const showTypeFilter = accept.length > 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-3xl">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0 shrink-0">
          <h2 className="text-base font-semibold text-white">{title}</h2>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 bg-white/6 rounded-lg p-0.5">
            {(["library", "upload"] as TabId[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-3.5 py-1.5 rounded-md text-xs font-medium capitalize transition-all",
                  tab === t
                    ? "bg-white/12 text-white shadow-sm"
                    : "text-gray-400 hover:text-white"
                )}
              >
                {t === "library" ? "Library" : "Upload"}
              </button>
            ))}
          </div>

          {/* X */}
          <DialogClose className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/30">
            <X className="w-4 h-4" />
          </DialogClose>
        </div>

        {/* ── Library: search + type filter ── */}
        {tab === "library" && (
          <div className="flex items-center gap-2 px-6 pt-4 pb-1 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>

            {showTypeFilter && (
              <div className="flex items-center gap-1">
                {(["all", ...accept] as (TypeFilter)[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize",
                      typeFilter === t
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "text-gray-500 hover:text-white border border-transparent"
                    )}
                  >
                    {t !== "all" && <span className={COLOR[t as MediaType]}>{ICON[t as MediaType]}</span>}
                    {t === "all" ? "All" : t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">

          {/* Library tab */}
          {tab === "library" && (
            isLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-gray-600">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <p className="text-sm text-gray-500">
                  {search ? "No results" : "Library is empty"}
                </p>
                <Button variant="ghost" size="sm" onClick={() => setTab("upload")}>
                  Upload a file
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                {filtered.map(item => (
                  <MediaThumb
                    key={item.id}
                    item={item}
                    selected={selected?.id === item.id}
                    onClick={() => setSelected(selected?.id === item.id ? null : item)}
                  />
                ))}
              </div>
            )
          )}

          {/* Upload tab */}
          {tab === "upload" && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all select-none min-h-[200px]",
                  dragging
                    ? "border-primary/70 bg-primary/8 scale-[1.01]"
                    : "border-white/15 hover:border-white/30 hover:bg-white/3"
                )}
              >
                <div className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors",
                  dragging ? "bg-primary/20 text-primary" : "bg-white/5 text-gray-500"
                )}>
                  <CloudUpload className="w-7 h-7" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-300 font-medium">
                    {dragging ? "Drop to upload" : "Drop files here"}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">or click to browse</p>
                </div>
                <p className="text-[11px] text-gray-700">
                  {accept.includes("video") && "MP4, MOV, WebM"}
                  {accept.includes("video") && accept.includes("audio") && " · "}
                  {accept.includes("audio") && "MP3, WAV, FLAC, AAC"}
                  {(accept.includes("video") || accept.includes("audio")) && accept.includes("image") && " · "}
                  {accept.includes("image") && "JPG, PNG, WebP"}
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={acceptAttr}
                multiple
                className="hidden"
                onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = "" }}
              />

              {/* Upload progress list */}
              {uploads.length > 0 && (
                <div className="space-y-2">
                  {uploads.map(entry => (
                    <UploadRow key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 shrink-0">
          <span className="text-xs text-gray-600">
            {selected ? (
              <span className="text-gray-400">
                Selected: <span className="text-white font-medium">{selected.prompt ?? selected.type}</span>
              </span>
            ) : (
              "No item selected"
            )}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!selected} onClick={handleAdd}>
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
