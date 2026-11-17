"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PLATFORMS, type Category, type Critique, type ForgedPrompt, type ForgeEvent, type ForgeRequest, type Mode, type Platform, type Profile, type Recommendation, type RecommendEvent } from "@/lib/types";
import { ModelPicker } from "./ModelPicker";
import { Recommendations } from "./Recommendations";
import { ResultView } from "./ResultView";
import { CheckIcon, HammerIcon, RefreshIcon, SparkIcon, StarIcon } from "./icons";
import { ScoreBadge, verifiedLabel } from "./ui";

const STYLE_PRESETS: Record<Category, string[]> = {
  text: ["Expert & concise", "Agent system prompt", "Step-by-step reasoning", "Strict JSON output", "Creative writing", "Coding assistant"],
  image: ["Photorealistic", "Cinematic still", "Anime", "3D render", "Product shot", "Watercolor", "Editorial fashion"],
  video: ["Cinematic live-action", "Pixar-style 3D animation", "Anime", "Handheld documentary", "Commercial / ad", "Music video", "Stop-motion"],
  audio: ["Pop", "Cinematic score", "Lo-fi", "Khaleeji / Arabic", "Hip-hop", "Voiceover narration"],
  "3d": ["Game-ready asset", "Stylized character", "Realistic product", "Low-poly", "Collectible figurine", "3D print"],
};

const MODE_INFO: Record<Mode, { label: string; placeholder: string }> = {
  create: { label: "Create", placeholder: "Describe what you want, in any language or style. E.g. 'A 10s Pixar-style shot of a fox chef flipping a pancake that lands on its head, SFX only'" },
  improve: { label: "Improve", placeholder: "Paste an existing prompt. It will be scored against the model's docs and rewritten." },
  convert: { label: "Convert", placeholder: "Paste a prompt written for another model. It will be translated to the target model's documented format." },
};

type Stage = { stage: string; message: string };

function partialPrompt(json: string): string {
  // Show the "prompt" field as it streams in, before the JSON is complete.
  const m = json.match(/"prompt"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (!m) return "";
  try {
    return JSON.parse(`"${m[1].replace(/\\$/, "")}"`);
  } catch {
    return m[1];
  }
}

async function toBase64(file: File): Promise<{ mediaType: string; data: string; name: string }> {
  const buf = await file.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { mediaType: file.type, data: btoa(bin), name: file.name };
}

export function Forge() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [mode, setMode] = useState<Mode>("create");
  const [modelId, setModelId] = useState("seedance-2-0");
  const [sourceModelId, setSourceModelId] = useState("midjourney");
  const [input, setInput] = useState("");
  const [style, setStyle] = useState("");
  const [images, setImages] = useState<{ mediaType: string; data: string; name: string }[]>([]);
  const [skipQuestions, setSkipQuestions] = useState(false);

  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [live, setLive] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [rounds, setRounds] = useState<{ round: number; score: number }[]>([]);
  const [final, setFinal] = useState<{ result: ForgedPrompt; critique: Critique; historyId: number; costUsd: number } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [recPlatform, setRecPlatform] = useState<Platform | "">("");
  const [recommending, setRecommending] = useState(false);
  const [recStage, setRecStage] = useState("");
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState<{ claude: boolean; perplexity: boolean } | null>(null);
  const liveBuf = useRef("");

  useEffect(() => {
    fetch("/api/profiles").then((r) => r.json()).then(setProfiles);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: { ready: { claude: boolean; perplexity: boolean } }) => setReady(s.ready));
  }, []);

  const target = profiles.find((p) => p.id === modelId);
  const noClaude = ready !== null && !ready.claude;
  const noResearch = ready !== null && !ready.perplexity;

  async function run(withAnswers?: string, modelOverride?: string) {
    setRunning(true);
    setError("");
    setFinal(null);
    setSaved(false);
    setRounds([]);
    setStages([]);
    setLive("");
    liveBuf.current = "";
    if (!withAnswers) setQuestions([]);

    const body: ForgeRequest = {
      mode,
      modelId: modelOverride ?? modelId,
      input,
      sourceModelId: mode === "convert" ? sourceModelId : undefined,
      style: style || undefined,
      images: images.map(({ mediaType, data }) => ({ mediaType, data })),
      skipQuestions,
      answers: withAnswers,
    };

    try {
      const res = await fetch("/api/forge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop()!;
        for (const line of lines) if (line.trim()) handle(JSON.parse(line) as ForgeEvent);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  function handle(e: ForgeEvent) {
    switch (e.type) {
      case "stage":
        setStages((s) => [...s, { stage: e.stage, message: e.message }]);
        if (e.stage === "compose") liveBuf.current = "";
        break;
      case "profile":
        setProfile(e.profile);
        setProfiles((ps) => ps.map((p) => (p.id === e.profile.id ? e.profile : p)));
        break;
      case "questions":
        setQuestions(e.questions);
        setAnswers(e.questions.map(() => ""));
        break;
      case "delta":
        liveBuf.current += e.text;
        setLive(partialPrompt(liveBuf.current));
        break;
      case "critique":
        setRounds((r) => [...r, { round: e.round, score: e.critique.score }]);
        break;
      case "final":
        setFinal(e);
        break;
      case "error":
        setError(e.message);
        break;
    }
  }

  async function recommend() {
    setRecommending(true);
    setRec(null);
    setError("");
    setRecStage("Starting…");
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, platform: recPlatform || undefined }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as RecommendEvent;
          if (e.type === "stage") setRecStage(e.message);
          else if (e.type === "result") setRec(e.recommendation);
          else if (e.type === "error") setError(e.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecommending(false);
    }
  }

  function forgeWith(id: string) {
    setModelId(id);
    setMode("create");
    run(undefined, id);
  }

  async function save() {
    if (!final) return;
    await fetch(`/api/library/${final.historyId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saved: true }) });
    setSaved(true);
  }

  const v = target ? verifiedLabel(target.lastVerified) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
      {/* Left: inputs */}
      <aside className="space-y-3">
        <div className="flex rounded-lg border border-line bg-panel p-0.5">
          {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`h-7 flex-1 rounded-md text-[13px] font-medium transition-colors ${mode === m ? "bg-hover text-text shadow-sm" : "text-muted hover:text-text"}`}
            >
              {MODE_INFO[m].label}
            </button>
          ))}
        </div>

        <div className="card divide-y divide-line">
          <div className="space-y-3 p-4">
            {mode === "convert" && <ModelPicker label="From model" value={sourceModelId} onChange={setSourceModelId} profiles={profiles} />}
            <div>
              <ModelPicker label={mode === "convert" ? "To model" : "Target model"} value={modelId} onChange={setModelId} profiles={profiles} />
              {target && v && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-faint">
                  <span className={`h-1.5 w-1.5 rounded-full ${v.ok ? "bg-good" : "bg-warn"}`} />
                  {target.vendor} · {v.text}
                  {!v.ok && !noResearch && " · docs researched on first use"}
                </p>
              )}
            </div>
          </div>

          <div className="p-4">
            <label className="label">{mode === "create" ? "Your idea" : "Existing prompt"}</label>
            <textarea
              className="input min-h-48 resize-y text-[14px] leading-6"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={MODE_INFO[mode].placeholder}
              dir="auto"
            />
            {mode === "create" && (
              <div className="mt-2 flex gap-2">
                <button
                  className="btn-ghost min-w-0 flex-1 whitespace-nowrap"
                  disabled={recommending || !input.trim() || noClaude || noResearch}
                  title={noClaude || noResearch ? "Needs Claude and your Perplexity key: add them in Settings" : undefined}
                  onClick={recommend}
                >
                  <SparkIcon className="h-3.5 w-3.5 text-accent-2" />
                  {recommending ? "Finding models…" : "Suggest best 3 models"}
                </button>
                <select
                  className="input h-8 w-[132px] shrink-0 py-0 text-xs"
                  value={recPlatform}
                  onChange={(e) => setRecPlatform(e.target.value as Platform | "")}
                  title="Only recommend models on this platform"
                >
                  <option value="">Any platform</option>
                  {(Object.keys(PLATFORMS) as Platform[]).map((p) => (
                    <option key={p} value={p}>{PLATFORMS[p]}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {target && (
            <div className="p-4">
              <label className="label">Style</label>
              <div className="mb-2 flex flex-wrap gap-1">
                {STYLE_PRESETS[target.category].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStyle(style === s ? "" : s)}
                    className={`chip ${style === s ? "border-accent/60 bg-accent/10 text-accent-2" : "hover:border-line-strong hover:text-text"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <input className="input" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Or describe any style" />
            </div>
          )}

          <div className="space-y-3 p-4">
            <div>
              <label className="label">Reference images</label>
              <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-line-strong px-3 py-3 text-xs text-muted transition-colors hover:border-accent hover:text-text">
                {images.length ? `${images.length} image${images.length > 1 ? "s" : ""} attached · change` : "Click to attach images (optional)"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = [...(e.target.files ?? [])].filter((f) => f.size < 5 * 1024 * 1024).slice(0, 6);
                    setImages(await Promise.all(files.map(toBase64)));
                  }}
                />
              </label>
              {images.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {images.map((im, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={`data:${im.mediaType};base64,${im.data}`} alt={im.name} className="h-12 w-12 rounded-md border border-line object-cover" />
                  ))}
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" className="accent-[var(--accent)]" checked={skipQuestions} onChange={(e) => setSkipQuestions(e.target.checked)} />
              Skip clarifying questions
            </label>

            <button className="btn-primary h-9 w-full" disabled={running || !input.trim() || noClaude} title={noClaude ? "Add your Anthropic API key in Settings first" : undefined} onClick={() => run()}>
              <HammerIcon />
              {running ? "Forging…" : "Forge prompt"}
            </button>
          </div>
        </div>
      </aside>

      {/* Right: progress and results */}
      <section className="min-w-0 space-y-4">
        {noClaude && (
          <div data-testid="need-claude" className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-[13px] leading-5 text-warn">
            <span className="font-medium">Add your Anthropic API key in <Link href="/settings" className="underline">Settings</Link> to forge prompts.</span>{" "}
            Get one at{" "}
            <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer" className="underline">platform.claude.com</a>, or choose
            Claude Code in Settings if you have a Claude plan. You can still browse and edit model profiles and your library.
          </div>
        )}
        {!noClaude && noResearch && (
          <div data-testid="need-perplexity" className="rounded-lg border border-line bg-panel px-4 py-3 text-[13px] leading-5 text-muted">
            Docs research is off. Add your Perplexity API key in <Link href="/settings" className="text-accent-2 underline">Settings</Link> to ground each
            prompt in the model&apos;s official docs and to get model suggestions. Until then, prompts use the built-in starter profiles.
          </div>
        )}
        {error && <div className="rounded-lg border border-bad/30 bg-bad/5 px-4 py-3 text-[13px] text-bad">{error}</div>}

        {recommending && (
          <div className="card flex items-center gap-2.5 px-4 py-3 text-[13px]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> {recStage}
          </div>
        )}
        {rec && <Recommendations rec={rec} selectedId={modelId} busy={running} onUse={setModelId} onForge={forgeWith} onClose={() => setRec(null)} />}

        {questions.length > 0 && !running && !final && (
          <div className="card space-y-3 p-4">
            <div>
              <h3 className="section-title">A few quick questions</h3>
              <p className="text-xs text-muted">Answer what you can; blanks use sensible defaults.</p>
            </div>
            {questions.map((q, i) => (
              <div key={i}>
                <label className="mb-1 block text-[13px]">{q}</label>
                <input className="input" dir="auto" value={answers[i] ?? ""} onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))} />
              </div>
            ))}
            <button className="btn-primary" onClick={() => run(questions.map((q, i) => `Q: ${q}\nA: ${answers[i] || "(use your best judgment)"}`).join("\n\n"))}>
              Continue
            </button>
          </div>
        )}

        {(running || stages.length > 0) && !final && (
          <div className="card p-4">
            <ol className="space-y-2 text-[13px]">
              {stages.map((s, i) => {
                const current = i === stages.length - 1 && running;
                return (
                  <li key={i} className={`flex items-center gap-2.5 ${current ? "text-text" : "text-muted"}`}>
                    {current ? <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> : <CheckIcon className="h-3.5 w-3.5 text-good" />}
                    {s.message}
                  </li>
                );
              })}
            </ol>
            {rounds.length > 0 && (
              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
                Review scores {rounds.map((r) => <ScoreBadge key={r.round} score={r.score} />)}
              </div>
            )}
            {live && (
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-panel-2 p-3 font-mono text-xs leading-5 text-muted">{live}</pre>
            )}
          </div>
        )}

        {final && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {rounds.length > 1 && (
                <span className="flex items-center gap-1.5">
                  Scores {rounds.map((r) => <ScoreBadge key={r.round} score={r.score} />)}
                </span>
              )}
              <span className="text-faint">·</span>
              <span>Cost ${final.costUsd.toFixed(3)}</span>
              <span className="ml-auto flex gap-2">
                <button className="btn-ghost" onClick={save} disabled={saved}>
                  <StarIcon filled={saved} className="h-3.5 w-3.5" /> {saved ? "Saved" : "Save to library"}
                </button>
                <button className="btn-ghost" onClick={() => { setMode("improve"); setInput(final.result.prompt); }}>
                  <RefreshIcon /> Refine further
                </button>
              </span>
            </div>
            <ResultView result={final.result} critique={final.critique} citations={profile?.citations} />
          </>
        )}

        {!running && !recommending && !rec && stages.length === 0 && !final && questions.length === 0 && (
          <div className="grid min-h-[520px] place-items-center rounded-lg border border-dashed border-line p-10 text-center">
            <div className="max-w-sm space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.png" alt="" className="mx-auto h-14 w-14 rounded-xl opacity-90" />
              <div>
                <h2 className="text-[15px] font-semibold">Forge a prompt</h2>
                <p className="mt-1 text-[13px] leading-5 text-muted">
                  Pick a model and describe what you want. PromptForge researches the model&apos;s official docs, writes the prompt block by block, and
                  reviews it until it passes.
                </p>
              </div>
              <div className="flex justify-center gap-4 text-xs text-faint">
                <span>{profiles.length} models</span>
                <span>·</span>
                <span>Doc-grounded</span>
                <span>·</span>
                <span>Self-reviewed</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
