// Shared Mock Data for Past Analyser UI Design Prototypes
// Rooted in the KainBain project architecture, workflows, models, and prompts.

(function(root) {
  const mockData = {
    meta: {
      generatedAt: "2026-08-30T21:40:00Z",
      project: "KainBain (Core API & Engine)",
      version: "2.4.0-phase2",
      analysisWindow: "Last 30 Days (4,820 Workflow Runs)",
      totalTokensAnalyzed: "148.6M Tokens",
      totalSpend: "$298.40",
      estimatedSavingsPotential: "$124.60 / mo (41.8%)"
    },

    // 1. DORA METRICS (Cost / Token Efficiency Focused - not speed)
    doraMetrics: {
      costPerSuccess: {
        current: 0.041,
        benchmark: 0.025,
        unit: "$ / successful task",
        status: "needs_improvement",
        changePct: -12.4, // 12.4% worse than target
        history: [0.062, 0.058, 0.051, 0.047, 0.041]
      },
      tokenReworkRatio: {
        current: 26.8,
        benchmark: 10.0,
        unit: "% tokens in retry loops",
        status: "warning",
        changePct: -4.2,
        history: [34.1, 31.0, 29.5, 27.8, 26.8]
      },
      changeFailCostWaste: {
        current: 48.20,
        benchmark: 15.00,
        unit: "$ wasted on failed stages",
        status: "critical",
        wastedRuns: 142,
        history: [68.50, 62.10, 54.00, 50.30, 48.20]
      },
      modelEfficiencyScore: {
        current: 74,
        benchmark: 90,
        unit: "Efficiency Index (0-100)",
        status: "moderate",
        downgradePotentialPct: 38.5,
        history: [62, 65, 68, 71, 74]
      },
      promptBloatIndex: {
        current: 34.2,
        benchmark: 12.0,
        unit: "% unneeded token overhead",
        status: "warning",
        redundantTokensAvg: 1840,
        history: [44.0, 41.2, 38.0, 36.1, 34.2]
      }
    },

    // 2. MODEL PERFORMANCE ESTIMATES & DOWNGRADE/UPGRADE DETECTOR
    models: [
      {
        key: "anthropic::claude-3-7-sonnet",
        name: "Claude 3.7 Sonnet",
        provider: "anthropic",
        totalRuns: 1420,
        failCount: 30,
        failRate: 2.1,
        avgTokensPerRun: 14200,
        costPerMInput: 3.00,
        costPerMOutput: 15.00,
        totalCost: 142.50,
        costSharePct: 47.8,
        overProvisionedTasksCount: 910,
        overProvisionedPct: 64.1,
        recommendation: {
          action: "DOWNGRADE",
          severity: "high",
          suggestedModel: "ollama-cloud::deepseek-v4-flash:0731-cloud",
          targetStages: ["Plan", "Summary Reporting", "Doc Gen"],
          monthlySavingsEst: "$78.40",
          confidence: 96,
          rationale: "Stage tasks in 'Plan' and 'Reporting' do not utilize complex multi-file reasoning. DeepSeek-v4-flash achieved 98.2% test parity on benchmark."
        }
      },
      {
        key: "google::gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        provider: "google",
        totalRuns: 840,
        failCount: 29,
        failRate: 3.4,
        avgTokensPerRun: 18500,
        costPerMInput: 1.25,
        costPerMOutput: 5.00,
        totalCost: 48.20,
        costSharePct: 16.2,
        overProvisionedTasksCount: 280,
        overProvisionedPct: 33.3,
        recommendation: {
          action: "OPTIMAL",
          severity: "low",
          suggestedModel: null,
          targetStages: ["Architecture & Spec", "Complex Integration Tests"],
          monthlySavingsEst: "$0.00",
          confidence: 92,
          rationale: "High complexity spec tasks justify 2.5 Pro reasoning with 96.6% 1-pass success rate."
        }
      },
      {
        key: "google::gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        provider: "google",
        totalRuns: 2680,
        failCount: 164,
        failRate: 6.1,
        avgTokensPerRun: 8100,
        costPerMInput: 0.075,
        costPerMOutput: 0.30,
        totalCost: 12.40,
        costSharePct: 4.2,
        overProvisionedTasksCount: 40,
        overProvisionedPct: 1.5,
        recommendation: {
          action: "STABLE",
          severity: "low",
          suggestedModel: null,
          targetStages: ["Unit Test Gen", "PR Review", "AST Parsing"],
          monthlySavingsEst: "$0.00",
          confidence: 94,
          rationale: "Exceptional cost-to-performance ratio for mid-complexity tasks."
        }
      },
      {
        key: "ollama-cloud::deepseek-v4-flash:0731-cloud",
        name: "DeepSeek V4 Flash (Cloud)",
        provider: "ollama-cloud",
        totalRuns: 3110,
        failCount: 131,
        failRate: 4.2,
        avgTokensPerRun: 6400,
        costPerMInput: 0.15,
        costPerMOutput: 0.60,
        totalCost: 18.60,
        costSharePct: 6.2,
        overProvisionedTasksCount: 0,
        overProvisionedPct: 0.0,
        recommendation: {
          action: "PROMOTE_DEFAULT",
          severity: "positive",
          suggestedModel: null,
          targetStages: ["Plan", "Spec Elab", "Reporting", "Triage"],
          monthlySavingsEst: "+$84.20 system-wide",
          confidence: 98,
          rationale: "Primary target candidate for downgrading expensive Claude 3.7 / Gemini Pro workloads."
        }
      },
      {
        key: "ollama-cloud::qwen-2.5-coder-32b",
        name: "Qwen 2.5 Coder 32B",
        provider: "ollama-cloud",
        totalRuns: 510,
        failCount: 60,
        failRate: 11.8,
        avgTokensPerRun: 11200,
        costPerMInput: 0.20,
        costPerMOutput: 0.80,
        totalCost: 4.80,
        costSharePct: 1.6,
        overProvisionedTasksCount: 0,
        overProvisionedPct: 0.0,
        recommendation: {
          action: "UPGRADE_NEEDED",
          severity: "critical",
          suggestedModel: "google::gemini-2.5-flash",
          targetStages: ["Implementation / Multi-file Refactor"],
          monthlySavingsEst: "-$1.20 cost, but saves $18.40 in retry loops",
          confidence: 89,
          rationale: "Model is under-provisioned for large refactors. 11.8% failure rate triggers expensive 3x retry cascades."
        }
      }
    ],

    // 3. WORKFLOW ANALYSER (First Pass, Frequent Loops, AI Split/Combine)
    workflows: [
      {
        id: "wf-core-feature",
        name: "Core Feature Delivery Lifecycle",
        totalRuns: 1840,
        firstPassSuccessRate: 64.2,
        avgCostPerRun: "$0.092",
        totalSpend: "$169.28",
        stages: [
          {
            id: "stage-plan",
            name: "Plan",
            model: "anthropic::claude-3-7-sonnet",
            avgTokens: 9400,
            avgCost: "$0.038",
            firstPassRate: 91.2,
            loopsCount: 28,
            recommendation: "Downgrade model to deepseek-v4-flash (saves 82% cost)"
          },
          {
            id: "stage-elab",
            name: "Spec / Technical Elab",
            model: "google::gemini-2.5-pro",
            avgTokens: 14200,
            avgCost: "$0.024",
            firstPassRate: 84.5,
            loopsCount: 62,
            recommendation: "Combine with Plan stage for sub-100-line tasks"
          },
          {
            id: "stage-impl",
            name: "Implementation",
            model: "anthropic::claude-3-7-sonnet",
            avgTokens: 24600,
            avgCost: "$0.089",
            firstPassRate: 58.4,
            loopsCount: 242,
            recommendation: "SPLIT REQUIRED: Monolithic stage. Split into Scaffold API vs UI component tasks"
          },
          {
            id: "stage-review",
            name: "Unit & Spec Review",
            model: "google::gemini-2.5-flash",
            avgTokens: 7800,
            avgCost: "$0.003",
            firstPassRate: 72.1,
            loopsCount: 198,
            recommendation: "Inject fast-lint CLI skill to prevent LLM syntax validation loops"
          },
          {
            id: "stage-deploy",
            name: "Deploy & Verification",
            model: "ollama-cloud::deepseek-v4-flash:0731-cloud",
            avgTokens: 4200,
            avgCost: "$0.001",
            firstPassRate: 98.1,
            loopsCount: 8,
            recommendation: "Optimal"
          }
        ],
        frequentLoops: [
          {
            id: "loop-impl-review",
            fromStage: "Unit & Spec Review",
            toStage: "Implementation",
            loopCount: 198,
            wastedSpend: "$34.20",
            primaryCause: "ESLint and typecheck errors caught post-generation instead of during generation",
            solution: "Create pre-commit CLI tool skill for agent runner"
          },
          {
            id: "loop-elab-plan",
            fromStage: "Spec / Technical Elab",
            toStage: "Plan",
            loopCount: 62,
            wastedSpend: "$14.10",
            primaryCause: "Missing {{taskDocs}} keyword interpolation causing missing context in prompt curation",
            solution: "Fix prompt curation engine template keywords and prune redundant report history"
          }
        ],
        splitCombineAnalysis: [
          {
            type: "SPLIT",
            target: "Implementation Stage (wf-core-feature)",
            impact: "High",
            currentBehavior: "Single agent attempts backend API + Fastify router + React UI in single 32k prompt context.",
            proposedBehavior: "Split into 2 parallel subagents: 'API Subagent' (gemini-flash) and 'UI Subagent' (deepseek-flash).",
            tokenSavings: "38% token reduction (-9,400 tokens/run)",
            projectedSavings: "$42.80/month"
          },
          {
            type: "COMBINE",
            target: "Plan + Spec Stages for Minor Tasks",
            impact: "Medium",
            currentBehavior: "2 distinct agent cycles for 1-file patch tasks.",
            proposedBehavior: "Combine Plan + Spec into single 'Fast Track Spec' stage when task complexity < 3.",
            tokenSavings: "44% token reduction on minor tasks (-5,200 tokens/run)",
            projectedSavings: "$18.60/month"
          }
        ]
      },
      {
        id: "wf-secobserve-patch",
        name: "SecObserve Vulnerability Patching",
        totalRuns: 420,
        firstPassSuccessRate: 78.4,
        avgCostPerRun: "$0.048",
        totalSpend: "$20.16",
        stages: [
          { id: "s-scan", name: "SecObserve Query", model: "google::gemini-2.5-flash", avgTokens: 18400, avgCost: "$0.008", firstPassRate: 98.0, loopsCount: 2, recommendation: "Inject SecObserve CLI Filter Tool" },
          { id: "s-fix", name: "Dependency / Code Patch", model: "anthropic::claude-3-7-sonnet", avgTokens: 16200, avgCost: "$0.052", firstPassRate: 74.0, loopsCount: 38, recommendation: "Downgrade to gemini-2.5-flash" },
          { id: "s-canary", name: "Canary Regression Run", model: "ollama-cloud::deepseek-v4-flash:0731-cloud", avgTokens: 3800, avgCost: "$0.001", firstPassRate: 92.0, loopsCount: 8, recommendation: "Optimal" }
        ],
        frequentLoops: [
          {
            id: "loop-sec-fix",
            fromStage: "Canary Regression Run",
            toStage: "Dependency / Code Patch",
            loopCount: 38,
            wastedSpend: "$4.80",
            primaryCause: "Full 48KB JSON payload from SecObserve injected into prompt, truncating canary instructions",
            solution: "Generate dedicated CLI filter tool to extract only affected CVE line references"
          }
        ],
        splitCombineAnalysis: []
      }
    ],

    // 4. AGENTS.MD / SYSTEM PROMPT OPTIMIZER
    agentsMdOptimizer: {
      totalFilesScanned: 4,
      totalRulesAnalyzed: 86,
      redundantRulesCount: 14,
      currentPromptOverheadTokens: 3850,
      optimizedPromptOverheadTokens: 1420,
      tokenReductionPct: 63.1,
      estimatedMonthlySavings: "$32.40",
      files: [
        {
          filename: "agents.md",
          path: "~/projects/kainbain/agents.md",
          currentTokens: 620,
          optimizedTokens: 180,
          savingsTokens: 440,
          issues: [
            "Duplicated markdown guidelines already specified in root instructions",
            "Redundant file path links that get overwritten by promptCuration.js dynamically"
          ],
          diff: `--- a/agents.md
+++ b/agents.md
@@ -1,12 +1,6 @@
 # Project Agents
-This document links the development agents back to the project space in SilverBullet.
-**Project Space:** [[~/apps/notes/silverbullet/space/Projects/Personal/KainBain]]
-## Agent Guidelines
-- Follow the standards defined in \`KB Code Standards.md\`.
-- Refer to \`KB Architecture.md\` for high-level design.
-- Use the defined testing scripts to verify changes.
+Project: KainBain | Rules: Follow \`KB Code Standards.md\` & verify with \`npm test\`.`
        },
        {
          filename: "api/promptCuration.js (Report History Window)",
          path: "~/projects/kainbain/api/promptCuration.js",
          currentTokens: 3230,
          optimizedTokens: 1240,
          savingsTokens: 1990,
          issues: [
            "Pushes 4 prior stage markdown reports into prompt context (2,400 tokens average)",
            "Unnecessary fallback boilerplate text repeats across each stage invocation"
          ],
          diff: `--- a/api/promptCuration.js
+++ b/api/promptCuration.js
@@ -325,3 +325,3 @@
-const recentReports = sortedReports.slice(-4);
+const recentReports = sortedReports.slice(-2); // Prune to 2 most recent reports
-promptParts.push(reportTextWithAllHistoricalFallbacks);
+promptParts.push(compactReportSnippet);`
        }
      ]
    },

    // 5. REFACTOR NEEDED DETECTOR (Code smells causing AI prompt bloat)
    refactorCandidates: [
      {
        file: "api/agentRunner.js",
        lines: 1240,
        promptInvocationsCount: 1420,
        avgTokensInjected: 4800,
        bloatScore: 92,
        smellType: "Monolithic Context Bloat",
        description: "Entire 1,240-line agent runner file is read and passed into prompt context for minor subagent modifications.",
        suggestedRefactor: "Extract EventBridge handlers and CLI execution into discrete helper modules (agentRunnerCore.js, agentRunnerEvents.js).",
        estimatedPromptTokenSavings: "3,100 tokens per prompt (64.5% reduction)",
        impactCost: "$44.80 / mo"
      },
      {
        file: "api/tasks.js",
        lines: 980,
        promptInvocationsCount: 980,
        avgTokensInjected: 3600,
        bloatScore: 84,
        smellType: "Mixed Routing & Business Logic",
        description: "Routes file embeds validation schemas, task state machine transitions, and database querying in 1 monolithic file.",
        suggestedRefactor: "Split into taskRoutes.js, taskStateMachine.js, and taskSchemaValidator.js.",
        estimatedPromptTokenSavings: "2,200 tokens per prompt (61% reduction)",
        impactCost: "$28.20 / mo"
      },
      {
        file: "canary-e2e/prod_manual_tester.mjs",
        lines: 850,
        promptInvocationsCount: 410,
        avgTokensInjected: 2900,
        bloatScore: 76,
        smellType: "Raw Unfiltered Trace Injection",
        description: "Injects full Playwright stdout dumps and HTML snapshots on test failures instead of concise selector errors.",
        suggestedRefactor: "Add concise error serializer returning only failed assertion line and DOM element snippet.",
        estimatedPromptTokenSavings: "2,400 tokens per failure prompt (82.7% reduction)",
        impactCost: "$16.40 / mo"
      }
    ],

    // 6. AGENT TOOL / SKILL CREATOR (Synthesizing CLI Tools & Skills from frequent patterns)
    synthesizedTools: [
      {
        id: "tool-git-ast-diff",
        name: "kainbain-git-diff-summary",
        type: "CLI Tool",
        triggerPattern: "Agent executing raw `git diff` with 12,000+ output tokens across 32 files",
        solutionSummary: "CLI binary that outputs structured JSON diff containing only modified function signatures and line ranges.",
        tokenReduction: "Replaces 12,000 tokens of raw git diff with 340 tokens of structured JSON",
        codeSnippet: `#!/usr/bin/env node
// kainbain-git-diff-summary.js
import { execSync } from 'child_process';
const diff = execSync('git diff -U1 --stat').toString();
console.log(JSON.stringify({ modifiedFiles: parseStat(diff), tokenFriendlySummary: true }));`,
        estimatedMonthlySavings: "$52.80",
        readiness: "Ready to deploy"
      },
      {
        id: "tool-secobserve-filter",
        name: "secobserve-finding-compact",
        type: "Skill / MCP Tool",
        triggerPattern: "Agent fetching entire 48KB SecObserve product observations payload",
        solutionSummary: "Pre-filtering endpoint returning only unresolved HIGH/CRITICAL findings with concise fix guidance.",
        tokenReduction: "Replaces 16,500 prompt tokens with 420 tokens",
        codeSnippet: `{
  "name": "get_critical_findings",
  "description": "Returns compact list of unsuppressed High/Critical SecObserve findings",
  "parameters": { "productId": { "type": "string" } }
}`,
        estimatedMonthlySavings: "$34.10",
        readiness: "Ready to deploy"
      },
      {
        id: "tool-fast-syntax-lint",
        name: "fast-preflight-linter",
        type: "Agent Hook Tool",
        triggerPattern: "Repeated retry loops on 'Unit Review' stage due to minor ESLint comma/semicolon syntax errors",
        solutionSummary: "Automatic local AST preflight check before submitting task for LLM review.",
        tokenReduction: "Eliminates 198 unnecessary review loops entirely",
        codeSnippet: `export function preflightLint(code) {
  const errors = oxc.parseSync(code).errors;
  return { valid: errors.length === 0, errors };
}`,
        estimatedMonthlySavings: "$38.00",
        readiness: "In Staging"
      }
    ],

    // 7. TOKEN TRACKING & PROVIDER COST ESTIMATES
    tokenTracking: {
      byProvider: [
        { provider: "anthropic", tokens: "42.1M", cost: 142.50, costSharePct: 47.8, color: "#f97316" },
        { provider: "google", tokens: "58.4M", cost: 60.60, costSharePct: 20.3, color: "#3b82f6" },
        { provider: "ollama-cloud", tokens: "44.2M", cost: 23.40, costSharePct: 7.8, color: "#10b981" },
        { provider: "openai", tokens: "3.9M", cost: 71.90, costSharePct: 24.1, color: "#8b5cf6" }
      ],
      dailySpendHistory: [
        { date: "Aug 24", spend: 14.20, tokens: 4.8 },
        { date: "Aug 25", spend: 12.80, tokens: 4.5 },
        { date: "Aug 26", spend: 15.10, tokens: 5.2 },
        { date: "Aug 27", spend: 11.40, tokens: 4.1 },
        { date: "Aug 28", spend: 9.80, tokens: 3.9 },
        { date: "Aug 29", spend: 8.40, tokens: 3.6 },
        { date: "Aug 30", spend: 7.90, tokens: 3.4 }
      ]
    },

    // 8. ACTIONABLE RECOMMENDATIONS FEED (For Copilot & Cards)
    actionableFeed: [
      {
        id: "act-1",
        title: "Downgrade 910 'Plan' stages from Claude 3.7 Sonnet to DeepSeek V4 Flash",
        badge: "HIGH SAVINGS",
        badgeColor: "emerald",
        impactMonthly: "$78.40 / mo",
        effort: "1-Click Config",
        confidence: 98,
        description: "Benchmark testing across 400 historical plan prompts showed DeepSeek v4 flash matched 98.4% plan validity with zero regressions."
      },
      {
        id: "act-2",
        title: "Deploy `kainbain-git-diff-summary` CLI Tool to Agent Runtime",
        badge: "TOOL SYNTHESIS",
        badgeColor: "purple",
        impactMonthly: "$52.80 / mo",
        effort: "Automatic Deployment",
        confidence: 95,
        description: "Replaces raw 12k token git diff dumps with structured 340 token JSON payloads during review stages."
      },
      {
        id: "act-3",
        title: "Prune redundant prompt boilerplate in `agents.md` & `api/promptCuration.js`",
        badge: "PROMPT BLOAT",
        badgeColor: "amber",
        impactMonthly: "$32.40 / mo",
        effort: "Immediate Diff Apply",
        confidence: 99,
        description: "Reduces historical stage reports accumulator from 4 reports to 2, saving 1,990 tokens per stage execution."
      },
      {
        id: "act-4",
        title: "Refactor `api/agentRunner.js` into Modular Sub-handlers",
        badge: "REFACTOR NEEDED",
        badgeColor: "blue",
        impactMonthly: "$44.80 / mo",
        effort: "Automated Code Task",
        confidence: 91,
        description: "1,240-line monolithic file is read into agent context in 82% of sessions. Splitting saves 3,100 tokens per prompt."
      },
      {
        id: "act-5",
        title: "Upgrade Qwen 2.5 Coder 32B to Gemini 2.5 Flash for Implementation Stages",
        badge: "UPGRADE RECOMMENDED",
        badgeColor: "rose",
        impactMonthly: "+$18.40 Net Saved in Retry Loops",
        effort: "Config Update",
        confidence: 89,
        description: "High 11.8% failure rate causes 3x retry cascades costing more in total tokens than a slightly smarter model."
      }
    ]
  };

  // Attach to window for browser use and export for Node.js
  if (typeof module !== "undefined" && module.exports) {
    module.exports = mockData;
  }
  if (typeof window !== "undefined") {
    window.PAST_ANALYSER_MOCK_DATA = mockData;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
