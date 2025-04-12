import { exec } from "child_process";
import { promisify } from "util";
import inquirer from "inquirer";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();
const execAsync = promisify(exec);

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

interface ExecutionState {
  currentDir: string;
  executedCommands: string[];
  projectRoot?: string;
}

// strip triple backtick code fences
function stripCodeFences(code: string): string {
  return code
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```$/, "")
    .trim();
}

// Detect file creation command
function isFileCreationCommand(cmd: string) {
  return (
    /\.(js|ts|json|jsx|tsx|py|sh|html|css)$/.test(cmd) ||
    cmd.includes("touch") ||
    cmd.includes(">")
  );
}

// Ask Gemini to generate code
async function generateFileContent(
  filePath: string,
  task: string
): Promise<string> {
  const prompt = `
  You are an AI developer. Based on the task "${task}", generate the complete working code for the file: ${filePath}.
  Respond with ONLY the code — no explanation, no markdown, no triple backticks.
  `;

  const response = await genAI.models.generateContent({
    model: "gemini-1.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const rawCode = response.text!.trim();
  return stripCodeFences(rawCode);
}

// Write code to a file
async function writeCodeToFile(filePath: string, code: string) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, code, "utf-8");
  console.log(`✅ Wrote code to ${filePath}`);
}

// Run the file and fix errors if needed
async function runFileAndFixIfError(filePath: string, task: string) {
  try {
    console.log(`⚙️ Running ${filePath}...`);
    const { stdout, stderr } = await execAsync(`node ${filePath}`);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (error: any) {
    console.error(`❌ Runtime error:`, error.stderr || error.message);
    const code = await fs.promises.readFile(filePath, "utf-8");

    const fixPrompt = `
  You are an AI that fixes JavaScript code.
  Here is the code that failed:\n\n${code}\n\n
  Here is the error:\n\n${error.stderr || error.message}
  Fix it so it works for the task: ${task}
  Return ONLY the fixed code — no markdown, no explanation, no triple backticks.
    `;

    const response = await genAI.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: fixPrompt }] }],
    });

    const fixedCodeRaw = response.text!.trim();
    const fixedCode = stripCodeFences(fixedCodeRaw);
    await writeCodeToFile(filePath, fixedCode);
    console.log(`🔁 Retrying...`);
    await runFileAndFixIfError(filePath, task);
  }
}

//  Get refined shell commands from Gemini
async function getRefinedPlan(
  task: string,
  state: ExecutionState
): Promise<string> {
  const context = `
Current directory: ${state.currentDir}
Project root: ${state.projectRoot || "unknown"}
Executed commands:\n${state.executedCommands.join("\n")}

Give the next set of bash commands only (no long-running dev servers).
Skip commands already run.
  `;

  const response = await genAI.models.generateContent({
    model: "gemini-1.5-flash",
    contents: [
      { role: "user", parts: [{ text: `${context}\n\nTask: ${task}` }] },
    ],
  });

  return stripCodeFences(response.text!.trim());
}

// Main command executor
async function executePlan(
  plan: string,
  state: ExecutionState,
  task: string
): Promise<{ success: boolean; newState: ExecutionState }> {
  const isLongRunningCommand = (cmd: string) =>
    ["npm run dev", "yarn dev", "pnpm dev"].some((longCmd) =>
      cmd.includes(longCmd)
    );

  const commands: string[] = [];

  plan
    .split("\n")
    .map((cmd) => cmd.trim())
    .forEach((cmd) => {
      if (
        !cmd ||
        cmd.startsWith("#") ||
        cmd.startsWith("```") ||
        cmd.toLowerCase() === "bash"
      ) {
        return;
      }

      if (isLongRunningCommand(cmd)) {
        console.log(`⚠️ Skipping long-running command: ${cmd}`);
        return;
      }

      commands.push(cmd);
    });

  for (const cmd of commands) {
    if (state.executedCommands.includes(cmd)) {
      console.log(`⏩ Skipping: ${cmd}`);
      continue;
    }

    if (cmd.startsWith("cd ")) {
      const targetDir = cmd.slice(3).trim();
      const newPath = path.resolve(state.currentDir, targetDir);

      try {
        if (!fs.existsSync(newPath)) {
          await fs.promises.mkdir(newPath, { recursive: true });
        }

        state.currentDir = newPath;
        process.chdir(newPath);
        state.executedCommands.push(cmd);
        console.log(`📂 Changed directory to: ${newPath}`);
      } catch (err) {
        console.error(`❌ Failed to change directory`);
        return { success: false, newState: state };
      }

      continue;
    }

    if (isFileCreationCommand(cmd)) {
      const filePath = cmd.split(" ").pop()!;
      const fullPath = path.resolve(state.currentDir, filePath);
      const code = await generateFileContent(fullPath, task);
      await writeCodeToFile(fullPath, code);
      await runFileAndFixIfError(fullPath, task);
      state.executedCommands.push(cmd);
      continue;
    }

    console.log(`\n🚀 Executing: ${cmd}`);
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: state.currentDir,
      });
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);

      state.executedCommands.push(cmd);
    } catch (error: any) {
      console.error(`❌ Command failed: ${cmd}`);
      if (error.stderr) console.error(error.stderr);
      else console.error(error.message);
      return { success: false, newState: state };
    }
  }

  return { success: true, newState: state };
}

// Main
async function main() {
  let state: ExecutionState = {
    currentDir: process.cwd(),
    executedCommands: [],
    projectRoot: undefined,
  };

  const { task: rawTask } = await inquirer.prompt({
    type: "input",
    name: "task",
    message: "📌 What do you want to build?",
  });

  if (rawTask.toLowerCase() === "exit") {
    console.log("👋 Exiting...");
    process.exit(0);
  }

  let task = rawTask;
  let attempt = 0;

  while (attempt < 3) {
    const plan = await getRefinedPlan(task, state);
    console.log(`\n🧠 Plan:\n${plan}`);

    const { confirm } = await inquirer.prompt({
      type: "confirm",
      name: "confirm",
      message: "Execute this plan?",
      default: true,
    });

    if (!confirm) {
      console.log("❌ Aborted by user.");
      return;
    }

    const result = await executePlan(plan, state, task);
    state = result.newState;

    if (result.success) {
      console.log("\n✅ All done!");
      return;
    }

    attempt++;
    const { feedback } = await inquirer.prompt({
      type: "input",
      name: "feedback",
      message: "What went wrong? (Gemini will use this to improve)",
    });

    task += "\nError: " + feedback;
  }

  console.log("\n❌ Maximum attempts reached.");
}

main().catch((err) => console.error("Fatal error:", err));
