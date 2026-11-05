// The model choices for a CLI. The app answers agents.models with the CLI's own list (Codex is asked, Claude Code
// has a list the app keeps); when that op is missing or fails, the lists below stand in. A model value is what the
// CLI's model option takes; "" means the CLI's own default (no option is passed).

const claude = (value, label, description) => ({ value, label, description, isDefault: value === "" });

/** Stand-ins, used only when the app cannot give a list. The Claude Code values are aliases, so they keep working as versions move. */
export const FIXED = {
  "claude-code": [
    claude("", "Default (recommended)", "Opus 5.5, Claude Code's own default"),
    claude("opus", "Opus", "Opus 5.5"),
    claude("fable", "Fable", "Fable 5.1"),
    claude("sonnet", "Sonnet", "Sonnet 5.5"),
    claude("haiku", "Haiku", "Haiku 5.5"),
  ],
  codex: [
    ["gpt-6.1-sol", "GPT-6.1-Sol"],
    ["gpt-6-astra", "GPT-6-Astra"],
    ["gpt-6.1-terra", "GPT-6.1 Terra"],
    ["gpt-6-sol", "GPT-6-Sol"],
    ["gpt-6-luna", "GPT-6-Luna"],
    ["gpt-5.6-sol", "GPT-5.6-Sol"],
    ["gpt-5.6-terra", "GPT-5.6-Terra"],
    ["gpt-5.6-luna", "GPT-5.6-Luna"],
  ].map(([value, label]) => ({ value, label, description: "", isDefault: false })),
};

/** The option list from an agents.models answer, or null when it holds nothing usable. */
export function fromAnswer(answer) {
  const models = Array.isArray(answer?.models) ? answer.models.filter((m) => m && typeof m.id === "string") : [];
  if (answer?.source === "none" || models.length === 0) return null;
  return models.map((m) => ({
    // Claude Code's "default" is not an alias to pass: it means no model option at all.
    value: m.id === "default" ? "" : m.id,
    label: m.name || m.id,
    description: m.description ?? "",
    isDefault: !!m.isDefault,
  }));
}

/**
 * The choices for one CLI type: { options, source, reason }. `source` is "app" when the app answered, "fixed" when the
 * stand-in list is used (with `reason` when the app was asked and failed), and "none" for a type with no list.
 */
export async function loadModels(app, type) {
  let reason = "";
  try {
    const answer = await app.agents.models(type);
    const options = fromAnswer(answer);
    if (options) return { options, source: "app", reason: answer.source === "fallback" ? (answer.reason ?? "") : "" };
    if (answer?.source === "none") return { options: [], source: "none", reason: "" };
  } catch (e) {
    reason = e?.message ?? String(e);
  }
  return FIXED[type] ? { options: FIXED[type], source: "fixed", reason } : { options: [], source: "none", reason };
}

/** One line for a choice in the menu. */
export function optionText(o) {
  return o.description ? `${o.label} — ${o.description}` : o.label;
}
