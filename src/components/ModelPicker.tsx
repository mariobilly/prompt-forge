"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, PLATFORMS, type Category, type Platform, type Profile } from "@/lib/types";
import { ChevronIcon, SearchIcon } from "./icons";

export const CATEGORY_LABEL: Record<Category, string> = { text: "Text / LLM", image: "Image", video: "Video", audio: "Audio / Music", "3d": "3D" };

export const PLATFORM_SHORT: Record<Platform, string> = { "comfyui-open": "Comfy", "comfyui-api": "Comfy API", krea: "Krea", higgsfield: "Higgsfield" };

export function PlatformTags({ platforms }: { platforms: Platform[] }) {
  return (
    <>
      {platforms.map((p) => (
        <span key={p} className="rounded border border-line px-1 py-px text-[10px] font-medium leading-4 text-muted">
          {PLATFORM_SHORT[p] ?? p}
        </span>
      ))}
    </>
  );
}

// Searchable model picker with category and platform filters; scales to hundreds of models.
export function ModelPicker({ label, value, onChange, profiles }: { label: string; value: string; onChange: (id: string) => void; profiles: Profile[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [plat, setPlat] = useState<Platform | "all">("all");
  const ref = useRef<HTMLDivElement>(null);
  const current = profiles.find((p) => p.id === value);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return profiles.filter(
      (p) =>
        (cat === "all" || p.category === cat) &&
        (plat === "all" || p.platforms.includes(plat)) &&
        words.every((w) => `${p.name} ${p.vendor}`.toLowerCase().includes(w)),
    );
  }, [profiles, q, cat, plat]);

  const counts = useMemo(() => {
    const c: Partial<Record<Category, number>> = {};
    for (const p of profiles) c[p.category] = (c[p.category] ?? 0) + 1;
    return c;
  }, [profiles]);

  return (
    <div ref={ref} className="relative">
      <label className="label">{label}</label>
      <button type="button" className="input flex h-9 items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <span className="truncate">
          {current ? current.name : "Choose a model…"}
          {current && (
            <span className="ml-2 text-xs text-muted">
              {CATEGORY_LABEL[current.category]}
            </span>
          )}
        </span>
        <ChevronIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[360px] overflow-hidden rounded-lg border border-line-strong bg-panel shadow-2xl shadow-black/60">
          <div className="space-y-2 border-b border-line p-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-faint" />
              <input autoFocus className="input pl-8" placeholder={`Search ${profiles.length} models…`} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1">
              {(["all", ...CATEGORIES] as const).map((c) => (
                <button key={c} onClick={() => setCat(c)} className={`chip ${cat === c ? "border-accent/60 bg-accent/10 text-accent-2" : "hover:border-line-strong hover:text-text"}`}>
                  {c === "all" ? `All ${profiles.length}` : `${CATEGORY_LABEL[c]} ${counts[c] ?? 0}`}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {(["all", ...Object.keys(PLATFORMS)] as (Platform | "all")[]).map((p) => (
                <button key={p} onClick={() => setPlat(p)} className={`chip ${plat === p ? "border-accent/60 bg-accent/10 text-accent-2" : "hover:border-line-strong hover:text-text"}`}>
                  {p === "all" ? "Any platform" : PLATFORMS[p]}
                </button>
              ))}
            </div>
          </div>
          <ul className="max-h-80 overflow-auto py-1">
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted">No match. Add it on the Model Profiles page.</li>}
            {shown.map((p) => (
              <li key={p.id}>
                <button
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-hover ${p.id === value ? "bg-hover" : ""}`}
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {p.name}
                    <span className="ml-1.5 text-xs text-faint">{p.vendor}</span>
                  </span>
                  <PlatformTags platforms={p.platforms} />
                  <span className="chip">{p.category}</span>
                  {p.lastVerified && (
                    <span title="Docs researched" className="h-1.5 w-1.5 rounded-full bg-good" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
