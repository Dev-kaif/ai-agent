Here’s a professional and clear `README.md` for your AI Agent project:

---

# 🤖 AI CLI Agent

An intelligent CLI agent that takes a natural language task from the user, uses the Gemini API to generate a shell plan, executes the commands, creates files, writes runnable code, auto-fixes errors, and reruns until success — all autonomously.

---

## 🚀 Features

- 🧠 **Gemini-powered planning**: Understands tasks and creates step-by-step shell command plans.
- 🛠️ **Automatic execution**: Runs shell commands safely, skipping long-running ones.
- 📝 **Code generation**: Generates relevant file content using Gemini based on the current task.
- 🧪 **Error recovery**: Detects runtime errors, asks Gemini to fix the code, rewrites it, and retries.
- 🔁 **Iterative refinement**: Asks for feedback and improves over multiple attempts.
- 📂 **Context-aware execution**: Remembers working directory, project root, and executed commands to avoid duplication.

---

## 📦 Installation

1. **Clone the repo**:

```bash
git clone https://github.com/yourusername/ai-cli-agent.git
cd ai-cli-agent
```

2. **Install dependencies**:

```bash
npm install
```

3. **Add your Gemini API Key**:

Create a `.env` file in the root:

```
GEMINI_API_KEY=your_google_gemini_api_key_here
```

---

## 🧑‍💻 Usage

```bash
ts-node src/Ai-agent.ts
```

You'll be prompted:

```
📌 What do you want to build?
```

Enter a task like:

```
Create a CLI tool that takes a user's name and displays a greeting with current time.
```

Then the agent will:

- Create a directory and initialize the project.
- Generate code files.
- Execute the program.
- Handle any errors by asking Gemini to fix them automatically.

---

## 💡 Examples of Tasks

```bash
Create a basic Express.js server that returns "Hello World" on `/`
Build a script that scrapes headlines from Hacker News using axios and cheerio
Make a CLI todo app in Python that saves data to a JSON file
```

---

## 🛡️ Limitations

- Avoid long-running dev commands like `npm run dev` — these are automatically skipped.
- Best used for scripts, utilities, and small setups — not full-blown production deployments.
- Assumes `node`, `npm`, and `ts-node` are available globally.

---

## 🔧 Tech Stack

- **TypeScript**
- **Node.js**
- **Inquirer.js** for CLI prompts
- **Google Gemini API (via @google/genai)**
- **Child process & fs modules** for command execution and file ops

---

## 📜 License

MIT

---
