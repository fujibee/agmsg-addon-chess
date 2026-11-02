// What the setup screen offers and remembers. Plain data in and out, so a test can cover it.

/** Model names worth suggesting per CLI. Free text is always allowed; an unknown CLI gets no suggestions. */
export const SUGGESTIONS = {
  "claude-code": ["opus", "sonnet", "haiku"],
};

const KEY = "chess.setup.v1";

/** The two sides' choices from what the app can start, falling back to the first type for a side that has none. */
export function defaultSetup(types) {
  const first = types[0]?.type ?? "";
  return { w: { type: first, model: "" }, b: { type: first, model: "" } };
}

/** A saved choice is kept only where its CLI still exists; a type without models loses its model. */
export function mergeSaved(saved, types) {
  const base = defaultSetup(types);
  const out = {};
  for (const side of ["w", "b"]) {
    const s = saved?.[side];
    const t = types.find((x) => x.type === s?.type);
    out[side] = t ? { type: t.type, model: t.models && typeof s.model === "string" ? s.model.trim() : "" } : base[side];
  }
  return out;
}

export function acceptsModel(types, type) {
  return !!types.find((t) => t.type === type)?.models;
}

/** "claude-code · opus" or just "codex". */
export function sideLabel({ type, model }) {
  return model ? `${type} · ${model}` : type;
}

/** The label at the edge of the board: the chosen model, or "CLI default" for a CLI that takes one and was given none. */
export function edgeLabel(side, types) {
  if (!side?.type) return "";
  return side.model ? `${side.type} \u00b7 ${side.model}` : acceptsModel(types, side.type) ? `${side.type} \u00b7 CLI default` : side.type;
}

export function swapSides(setup) {
  return { w: { ...setup.b }, b: { ...setup.w } };
}

export function load(storage, types) {
  try {
    return mergeSaved(JSON.parse(storage.getItem(KEY) ?? "null"), types);
  } catch (_) {
    return defaultSetup(types);
  }
}

export function save(storage, setup) {
  try {
    storage.setItem(KEY, JSON.stringify(setup));
  } catch (_) {
    /* a private window or blocked storage: the choice is simply not remembered */
  }
}
