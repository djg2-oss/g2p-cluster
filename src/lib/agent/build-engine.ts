/** Builder mastery — local software engineering playbooks */

export type BuildPlan = {
  title: string;
  summary: string;
  architecture: string[];
  steps: string[];
  files: string[];
  risks: string[];
  verify: string[];
  security: string[];
};

const STACK_HINTS: { test: RegExp; title: string; files: string[]; arch: string[] }[] = [
  {
    test: /react|next|tanstack|vite|spa|dashboard|ui/i,
    title: "Web app (React / Vite-class)",
    files: [
      "src/routes/ (or app/) — pages",
      "src/components/ui — primitives",
      "src/lib/ — pure logic, no JSX",
      "src/styles.css — design tokens only",
    ],
    arch: [
      "UI shell thin; domain logic in pure modules",
      "State: local for UI, store for cross-cutting, server for authority",
      "Tokens in CSS; no ad-hoc hex in components",
      "Feature folders only when a feature has 3+ files",
    ],
  },
  {
    test: /api|backend|server|endpoint|rest|graphql/i,
    title: "API / backend",
    files: ["routes/handlers", "services/ (business rules)", "db/ or repos", "auth middleware"],
    arch: [
      "Handler → service → data access (no business logic in handlers)",
      "Validate input at the boundary (zod or equivalent)",
      "Idempotent writes where retries happen",
      "Structured errors; never leak stack traces to clients",
    ],
  },
  {
    test: /python|script|data|etl|pandas|automation/i,
    title: "Python / automation",
    files: ["src/ or package root", "tests/", "pyproject.toml or requirements", "cli entry"],
    arch: [
      "Pure functions for transforms; I/O at edges",
      "Type hints on public APIs",
      "One command to run tests",
      "Config via env; no secrets in repo",
    ],
  },
  {
    test: /mobile|ios|android|react native|flutter/i,
    title: "Mobile client",
    files: ["screens/", "components/", "services/api", "state/"],
    arch: [
      "Offline-friendly state where needed",
      "Navigation typed and centralized",
      "Network layer isolated from UI",
      "Touch targets ≥ 44px",
    ],
  },
];

export function buildSoftwarePlan(input: string): BuildPlan {
  const hit =
    STACK_HINTS.find((h) => h.test.test(input)) ??
    ({
      title: "Software build",
      files: ["src/", "tests/", "README (only if needed)", "config"],
      arch: [
        "Separate pure logic from I/O",
        "Smallest vertical slice first",
        "Name by intent, not by type",
        "Verify before calling done",
      ],
    } as const);

  return {
    title: hit.title,
    summary: input.trim().slice(0, 320),
    architecture: hit.arch,
    steps: [
      "Restate goal, constraints, and definition of done in one paragraph",
      "Choose the smallest shippable slice",
      "Scaffold structure; put pure logic in testable modules first",
      "Implement happy path end-to-end",
      "Add edge cases and error states",
      "Typecheck + build + manual smoke of primary path",
      "Refactor only after green",
    ],
    files: hit.files,
    risks: [
      "Scope creep — freeze v1 surface early",
      "Mixing UI and business rules",
      "Skipping production build verification",
      "Secrets or PII in client bundles",
    ],
    verify: [
      "Typecheck clean",
      "Production build succeeds",
      "Primary user path works in a real browser",
      "Mobile ~390px usable if UI",
      "No uncaught console errors on happy path",
    ],
    security: [
      "Validate all external input",
      "Least privilege for tokens and DB",
      "No secrets in frontend or git",
      "Escape/encode output where HTML is rendered",
      "Depend on known libraries; avoid eval on untrusted strings",
    ],
  };
}

export function formatBuildPlan(p: BuildPlan): string {
  return [
    `**${p.title}**`,
    "",
    `**Request:** ${p.summary}`,
    "",
    "**Architecture principles:**",
    ...p.architecture.map((a, i) => `${i + 1}. ${a}`),
    "",
    "**Suggested layout:**",
    ...p.files.map((f) => `• ${f}`),
    "",
    "**Build sequence:**",
    ...p.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "**Risks:**",
    ...p.risks.map((r) => `• ${r}`),
    "",
    "**Verify before done:**",
    ...p.verify.map((v) => `• ${v}`),
    "",
    "**Security baseline:**",
    ...p.security.map((s) => `• ${s}`),
  ].join("\n");
}

/** Detect common code review issues in pasted snippets (heuristic) */
export function quickCodeReview(code: string): string[] {
  const findings: string[] = [];
  if (/eval\s*\(|new Function\s*\(/i.test(code)) {
    findings.push("Dynamic eval/Function — avoid on untrusted input");
  }
  if (/innerHTML\s*=/.test(code)) {
    findings.push("innerHTML assignment — prefer textContent or sanitized render");
  }
  if (/password|api[_-]?key|secret/i.test(code) && /['"][^'"]{8,}['"]/.test(code)) {
    findings.push("Possible hard-coded secret — move to env / secret store");
  }
  if (/any\b/.test(code) && /:\s*any/.test(code)) {
    findings.push("TypeScript `any` detected — tighten types at boundaries");
  }
  if (/console\.log/.test(code)) {
    findings.push("console.log left in code — remove or gate for production");
  }
  if (!findings.length) {
    findings.push("No obvious red flags in a quick pass — share more context for deeper review");
  }
  return findings;
}
