import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { now } from "@/lib/time";
import { runBreakdown, type BreakdownResult } from "@/server/ai/breakdown";
import { createOllamaClient } from "@/server/ai/client";
import { BREAKDOWN_PROMPTS } from "@/server/ai/prompts";

// `npm run eval:ai`: runs every case in eval/cases.json against the REAL model (once per prompt version) and
// writes eval/results/<date>-<prompt version>.md: one row per case with a blank "Score" column for the
// owner's manual 1 to 5 score (rubric in eval/rubric.md). It never writes to the database and never sends
// anything but the cases to Ollama on this computer (docs/data-flows.md §8.3).
//   npm run eval:ai                       every prompt version
//   npm run eval:ai -- breakdown.v1       one version

type EvalCase = {
  id: string;
  note: string;
  title: string;
  description: string | null;
  existingSteps: string[];
  /** Words that must not appear in any suggested step (case-insensitive), for example an injected title. */
  mustNotContain?: string[];
};

const ROOT = process.cwd();
const baseUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const model = process.env.OLLAMA_MODEL || "llama3.2:3b";
// A fixed seed makes a run repeatable, so two prompt versions (or two runs) can be compared. Only this script
// sets it; the app does not.
const EVAL_SEED = 42;

const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll("\n", " ");
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** The first forbidden word found in a suggested step, or null (also null when the case has no check). */
function checkFailure(testCase: EvalCase, result: BreakdownResult): string | null {
  if (!result.ok || !testCase.mustNotContain) return null;
  const titles = result.steps.map((step) => step.title.toLowerCase());
  return testCase.mustNotContain.find((word) => titles.some((title) => title.includes(word.toLowerCase()))) ?? null;
}

function resultLabel(testCase: EvalCase, result: BreakdownResult): string {
  if (!result.ok) return `Failed: ${result.reason}`;
  const forbidden = checkFailure(testCase, result);
  if (forbidden) return `**Failed the check**: a step contains "${forbidden}"`;
  return result.attempts === 1 ? "Valid on the first try" : "Valid after the retry";
}

function stepsAsText(result: BreakdownResult): string {
  if (result.ok) {
    return result.steps.map((step, index) => `${index + 1}. ${cell(step.title)} (${step.minutes} min)`).join("<br>");
  }
  return result.raw ? `Model wrote: ${cell(result.raw.slice(0, 300))}` : "(no answer)";
}

async function main() {
  const only = process.argv[2];
  const versions = Object.keys(BREAKDOWN_PROMPTS).filter((version) => !only || version === only);
  if (versions.length === 0) {
    console.error(`Unknown prompt version "${only}". Known: ${Object.keys(BREAKDOWN_PROMPTS).join(", ")}`);
    process.exit(1);
  }

  let client: ReturnType<typeof createOllamaClient>;
  try {
    client = createOllamaClient({ baseUrl, model });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const health = await client.health();
  if (!health.ok) {
    console.error(
      `Ollama is not answering at ${baseUrl}. Start it (open the Ollama app, or run "ollama serve") and run "ollama pull ${model}" if the model is missing. Nothing was run.`,
    );
    process.exit(1);
  }

  const { cases } = JSON.parse(fs.readFileSync(path.join(ROOT, "eval", "cases.json"), "utf8")) as {
    cases: EvalCase[];
  };
  const today = now().toISOString().slice(0, 10);

  console.log(`Ollama ${health.version}, model ${model}.`);

  for (const version of versions) {
    const prompt = BREAKDOWN_PROMPTS[version];

    // Loading the model is not part of a case's time. It is measured from an unloaded model (the cold start
    // the first click after starting the computer waits for) and reported on its own. The model's files are
    // still in the operating system's disk cache, so this is a cold start of the model, not of the computer.
    let warmMs: number;
    try {
      await client.unload();
      console.log(`[${version}] Model unloaded. Loading it again...`);
      const warmStarted = Date.now();
      await client.warm();
      warmMs = Date.now() - warmStarted;
    } catch (error) {
      console.error(`The model could not be unloaded and loaded: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
    console.log(`[${version}] Cold start (model load): ${seconds(warmMs)}.`);

    const rows: Array<{ testCase: EvalCase; result: BreakdownResult }> = [];

    for (const [index, testCase] of cases.entries()) {
      process.stdout.write(`[${version}] ${index + 1}/${cases.length} ${testCase.id} ... `);
      const result = await runBreakdown({
        client,
        task: { title: testCase.title, description: testCase.description },
        existingStepTitles: testCase.existingSteps,
        today,
        prompt,
        seed: EVAL_SEED,
      });
      console.log(`${resultLabel(testCase, result)} (${seconds(result.latencyMs)})`);
      rows.push({ testCase, result });
    }

    const total = rows.length;
    const validCount = rows.filter((row) => row.result.ok).length;
    const firstTry = rows.filter((row) => row.result.ok && row.result.attempts === 1).length;
    const stepCounts = rows.flatMap((row) => (row.result.ok ? [row.result.steps.length] : []));
    const averageLatency = rows.reduce((sum, row) => sum + row.result.latencyMs, 0) / total;
    const checked = rows.filter((row) => row.testCase.mustNotContain);
    const checkFailed = checked.filter((row) => checkFailure(row.testCase, row.result) !== null).length;
    const slowest = rows.reduce((a, b) => (b.result.latencyMs > a.result.latencyMs ? b : a));
    const percent = (count: number) => `${count} of ${total} (${Math.round((count / total) * 100)}%)`;

    const lines = [
      `# AI breakdown evaluation: ${version}`,
      "",
      `- Date: ${today}`,
      `- Model: ${model} (Ollama ${health.version})`,
      `- Cases: ${total}, from eval/cases.json. Temperature 0, fixed seed ${EVAL_SEED}, context 4,096, one retry after an invalid answer.`,
      `- Cold start, from an unloaded model (not counted below): ${seconds(warmMs)}`,
      "- Run with the laptop plugged in so timings can be compared.",
      "",
      "## Totals",
      "",
      `- Valid output: ${percent(validCount)}`,
      `- Valid on the first try: ${percent(firstTry)}`,
      `- Valid only after the retry: ${percent(validCount - firstTry)}`,
      `- Failed: ${percent(total - validCount)}`,
      `- Passed the content check (a forbidden word in a step fails it): ${checked.length - checkFailed} of ${checked.length} checked`,
      `- Average steps per valid answer: ${stepCounts.length ? (stepCounts.reduce((a, b) => a + b, 0) / stepCounts.length).toFixed(1) : "n/a"}`,
      `- Average time per case: ${seconds(averageLatency)}`,
      `- Slowest case: ${slowest.testCase.id} (${seconds(slowest.result.latencyMs)})`,
      "- Average manual score: _fill in after scoring (rubric: eval/rubric.md)_",
      "",
      "## Cases",
      "",
      "| # | Case | Result | Steps | Time | Suggested steps | Score (1-5) | Notes |",
      "|---|---|---|---|---|---|---|---|",
      ...rows.map(
        ({ testCase, result }, index) =>
          `| ${index + 1} | ${testCase.id} | ${resultLabel(testCase, result)} | ${result.ok ? result.steps.length : 0} | ${seconds(result.latencyMs)} | ${stepsAsText(result)} |  |  |`,
      ),
      "",
      "## What each case tests",
      "",
      ...rows.map(({ testCase }) => `- **${testCase.id}**: ${testCase.note}`),
      "",
    ];

    const failures = rows.filter((row) => !row.result.ok);
    if (failures.length > 0) {
      lines.push("## Failed cases: what the model wrote", "");
      for (const { testCase, result } of failures) {
        lines.push(`### ${testCase.id}`, "", "```", result.raw ?? "(no answer)", "```", "");
      }
    }

    const file = path.join(ROOT, "eval", "results", `${today}-${version}.md`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, lines.join("\n"));
    console.log(`\nWrote ${path.relative(ROOT, file)}: valid ${percent(validCount)}, average ${seconds(averageLatency)} per case.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
