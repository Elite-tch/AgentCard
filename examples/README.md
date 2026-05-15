# agentcard agent examples

Three working integrations showing how to use agentcard from different
environments. Each example is self-contained with its own dependencies.

## Quick start (all examples)

1. Create an agent in the agentcard dashboard (Agents tab → Create Agent) and copy the claim code
2. Run `npx -y agentcard@latest onboard --claim <code>` to exchange the claim for credentials
3. Fund your wallet (MCP: run `setup_wallet`; manual: send at least 2 XLM to the address)

## Examples

### `node-agent/` — Node.js + agentcard SDK

The recommended path for TypeScript/JavaScript agents. Uses the `agentcard`
npm package with the all-in-one `purchaseCardOWS()` helper.

```bash
cd node-agent
npm install
AGENTCARD_API_KEY=agentcard_... OWS_WALLET_NAME=my-agent node index.mjs
```

### `python-agent/` — Python + REST API

Uses the REST API directly via `httpx`. Shows the full create → poll → read
flow. Payment must be completed externally (Stellar SDK or MCP server).

```bash
cd python-agent
pip install -r requirements.txt
AGENTCARD_API_KEY=agentcard_... python main.py
```

### `langchain-tool/` — LangChain custom tools

Three LangChain `BaseTool` subclasses that any LangChain agent can use:

- `AgentcardOrderTool` — create a card order
- `AgentcardCheckOrderTool` — poll order status / get card details
- `AgentcardBudgetTool` — check spend vs limit

```python
from agentcard_tool import AgentcardOrderTool, AgentcardCheckOrderTool, AgentcardBudgetTool

tools = [AgentcardOrderTool(), AgentcardCheckOrderTool(), AgentcardBudgetTool()]
agent = initialize_agent(tools, llm, agent=AgentType.OPENAI_FUNCTIONS)
agent.run("Buy me a $5 virtual Visa card")
```

## MCP server (Claude Code / Claude Desktop)

The fastest path for Claude-based agents. No code needed — just configure:

```json
{
  "mcpServers": {
    "agentcard": {
      "command": "npx",
      "args": ["-y", "agentcard@latest"],
      "env": {
        "AGENTCARD_API_KEY": "agentcard_...",
        "OWS_WALLET_NAME": "my-agent"
      }
    }
  }
}
```

The `agentcard` CLI defaults to the `mcp` subcommand when no other subcommand
is passed, so `npx agentcard@latest` with no args runs the MCP server. `-y`
auto-accepts the one-time install prompt. **Always pin `@latest`** — without
it, `npx` serves whatever version it first resolved from its local cache
indefinitely, so SDK patch releases (particularly the ones touching on-chain
payment paths) don't reach the agent until the operator manually clears the
npx cache. With `@latest`, every invocation re-resolves against the registry.

Then ask Claude: "Buy me a $10 virtual Visa card."

## API reference

See [`contract/api/agent-api.openapi.yaml`](../contract/api/agent-api.openapi.yaml)
for the full OpenAPI spec of the agent-facing API.
