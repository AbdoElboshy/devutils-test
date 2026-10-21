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