const STEPS = [
  ["Intake", "Claude Sonnet reads your idea (any language, plus reference images) and turns it into a precise intent. It only asks questions when an answer would change the result."],
  ["Research", "Each model has a profile built from its official docs. Profiles older than 14 days are re-researched live with Perplexity, limited to the vendor's own domains, and every rule keeps its source link."],
  ["Compose", "Claude Opus writes the prompt block by block, following the model's blueprint: the most important context first, then references, the shot/beat structure, hard locks and motion principles."],
  ["Critique", "A separate reviewer scores the prompt against the doc checklist and lists concrete fixes. Below 90, the prompt is revised, up to two more rounds, and the best version wins."],
];

export default function About() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">How PromptForge works</h1>
      <ol className="space-y-3">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="card p-4">
            <div className="font-medium">{i + 1}. {t}</div>
            <p className="text-sm text-muted">{d}</p>
          </li>
        ))}
      </ol>
      <div className="card border-warn/40 p-4 text-sm">
        <div className="mb-1 font-medium text-warn">An honest note on accuracy</div>
        <p className="text-muted">
          No prompt can guarantee a 100% exact output, because generative models are probabilistic. PromptForge gives you the best chance
          by keeping every prompt faithful to the model&apos;s current official documentation, removing ambiguity so the model doesn&apos;t
          have to guess, and checking each prompt before you use it. For critical work, generate several takes and iterate with
          &quot;Refine further&quot;.
        </p>
      </div>
    </div>
  );
}
