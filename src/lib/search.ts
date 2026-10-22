import { ERROR_DB } from "./blueprints";
import { CATEGORIES, searchTools, TOOL_MAP } from "./registry";
import { WORKFLOW_TEMPLATES } from "../data/workflows";
import { isFeatureEnabled } from "../platform/features";

export type DiscoveryKind = "tool" | "category" | "workflow" | "error";

export type DiscoveryHit = {
  id: string;
  kind: DiscoveryKind;
  title: string;
  description: string;
  route: string;
  score: number;
  reason?: string;
};

function textScore(query: string, title: string, terms: string[]): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const titleLower = title.toLowerCase();
  const haystack = `${titleLower} ${terms.join(" ").toLowerCase()}`;
  let score = 0;
  if (titleLower === q) score += 120;
  if (terms.some((term) => term.toLowerCase() === q)) score += 100;
  if (titleLower.includes(q)) score += 45;
  const tokens = q.split(/\s+/).filter((token) => token.length > 1);
  tokens.forEach((token) => {
    if (haystack.includes(token)) score += token.length >= 5 ? 14 : 8;
  });
  return score;
}

export function searchDiscovery(query: string, limit = 14): DiscoveryHit[] {
  const q = query.trim();
  if (!q) {
    return searchTools("", limit).map(({ tool }) => ({ id: tool.id, kind: "tool", title: tool.name, description: tool.description, route: tool.route, score: 1 }));
  }
  const tools: DiscoveryHit[] = searchTools(q, limit).map(({ tool, score, reason }) => ({ id: tool.id, kind: "tool", title: tool.name, description: tool.description, route: tool.route, score, reason }));
  const categories: DiscoveryHit[] = CATEGORIES.map((category) => ({
    id: `category:${category.id}`,
    kind: "category" as const,
    title: category.name,
    description: category.description,
    route: `/categories/${category.slug}`,
    score: textScore(q, category.name, [category.description, category.tagline, ...category.groups.flatMap((group) => [group.name, group.blurb])]),
    reason: "category",
  })).filter((hit) => hit.score > 0);
  const errors: DiscoveryHit[] = ERROR_DB.map((error) => ({
    id: `error:${error.id}`,
    kind: "error" as const,
    title: error.title,
    description: `${error.area}: ${error.cause}`,
    route: "/errors",
    score: textScore(q, error.title, [...error.match, error.area, error.cause]) + (error.match.some((term) => term.toLowerCase() === q.toLowerCase()) ? 70 : 0),
    reason: "known error",
  })).filter((hit) => hit.score > 0);
  const workflows: DiscoveryHit[] = (isFeatureEnabled("workflows") ? WORKFLOW_TEMPLATES : []).map((workflow) => ({
    id: `workflow:${workflow.id}`,
    kind: "workflow" as const,
    title: workflow.name,
    description: workflow.description,
    route: "/workflows",
    score: textScore(q, workflow.name, [workflow.description, workflow.category, ...workflow.steps.map((step) => step.label)]),
    reason: "workflow",
  })).filter((hit) => hit.score > 0);
  return [...tools, ...errors, ...workflows, ...categories]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export function toolDiscoveryHit(id: string, reason?: string): DiscoveryHit | null {
  const tool = TOOL_MAP[id];
  return tool ? { id: tool.id, kind: "tool", title: tool.name, description: tool.description, route: tool.route, score: 1, reason } : null;
}

export function suggestFallback(query: string, suggestLimit = 5): DiscoveryHit[] {
  const q = query.trim();
  if (!q) return [];
  const tokens = q.toLowerCase().split(/[\s\W]+/).filter((t) => t.length > 1);
  const score = (title: string) => {
    const lower = title.toLowerCase();
    let s = 0;
    tokens.forEach((token) => {
      if (lower.includes(token)) s += 10;
      let i = 0;
      for (const ch of lower) {
        if (ch === token[i]) i += 1;
        if (i === token.length) break;
      }
      if (i === token.length) s += 3;
    });
    return s;
  };
  const toolHits = searchTools("", 500).map(({ tool }) => ({
    id: tool.id, kind: "tool" as const, title: tool.name, description: tool.description,
    route: tool.route, score: score(tool.name), reason: "fuzzy suggestion",
  })).filter((h) => h.score > 0);
  const catHits = CATEGORIES.map((category) => ({
    id: `category:${category.id}`, kind: "category" as const, title: category.name,
    description: category.description, route: `/categories/${category.slug}`,
    score: score(category.name), reason: "fuzzy suggestion",
  })).filter((h) => h.score > 0);
  return [...toolHits, ...catHits].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, suggestLimit);
}
