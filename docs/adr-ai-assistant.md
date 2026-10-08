# ADR: AI assistant (chat that navigates the UI and acts)

Status: accepted (backend and frontend).
Applies to: epic #265, backend sub-epic #266, frontend sub-epic #267, RAG #268; tasks #269–#279.

## Context

The product spec `docs/ai-chatbot.md` describes an assistant that can do anything
a signed-in user can do — open the right page, explain a number, and perform an
entry — under the user's real session, role and entity scope. The repository had
the spec and a static in-app Guide, but no model integration, no tool layer, and
no dependency on an LLM SDK.

The backend must:

- Work with Ollama, Anthropic Claude, OpenAI ChatGPT, Hugging Face, OpenRouter,
  and any OpenAI-compatible endpoint.
- Add no LLM SDK to the default install.
- Persist conversations and audit every action.
- Require an explicit confirmation before any write.

## Decision

### A provider port, not an SDK

`src/ai/provider.ts` defines one `LlmProvider` port over neutral shapes
(`ChatMessage`, `ToolDefinition`, `ToolCall`, `CompletionResult`). Each provider
is a `fetch`-based adapter that injects its transport, so it is tested offline —
the same pattern as `src/adapters` and `docs/adr-adapter-contract.md`:

- `src/ai/providers/openai-compatible.ts` is the shared base for OpenAI, Ollama,
  OpenRouter, Hugging Face, Cloudflare Workers AI, and any
  `/v1/chat/completions` endpoint.
- `src/ai/providers/anthropic.ts` translates the Messages API (system prompt,
  tool-use content blocks) in both directions.
- Cloudflare Workers AI is the same OpenAI-compatible base, with two specifics:
  its base URL is derived from `CLOUDFLARE_ACCOUNT_ID`, and it requires an
  **empty string** (not `null`) for a tool-call assistant message, which the
  adapter's `emptyContentForToolCalls` option provides. The default model
  (`@cf/qwen/qwen3-30b-a3b-fp8`) runs on the Workers Free plan and emits tool
  calls; paid-only models are rejected on Free.
- `src/ai/registry.ts` selects the provider from config; `src/ai/config.ts` reads
  `AI_PROVIDER` and keys. Unset `AI_PROVIDER` means the assistant is off, exactly  like `solanaDeployment()` returning null.

A `runProviderContract` suite (`src/ai/provider-contract.ts`) asserts, for every
provider, the neutral shape, a tool-call round-trip, a typed error on a non-2xx,
and no network when the transport is faked. A coverage test fails if a provider
key has no case.

### Tools are the existing actions, guarded

`src/ai/tools/` wraps what the dashboard already does:

- **Read tools** read the session-scoped `Books` (entities, holdings, journal,
  reconciliation, connections, audit).
- **Write tools** call the same domain functions the dashboard server actions
  call (`postFormJournal` + `insertJournal`, `matchReconciliation`,
  `closePeriod`, …) after the *same* guards: `can(role, permission)`,
  `canWriteBooks`, `canAccessEntity`.
- **On-chain prepare tools** call the existing `prepare*` server actions through
  FormData, reusing their CSRF and permission guards, and return the library-free
  `SerializablePlan`. They never sign or submit.
- **Write tools also expose `preview()`** — a side-effect-free summary (key
  fields, journal lines and balance, or the on-chain plan). The runtime computes
  it when a write is proposed, so the confirmation card shows what will happen
  before anything runs.

`toolsFor(session)` omits any tool whose permission the role lacks, so the
assistant is not a privilege escalator (`docs/ai-chatbot.md` §7).

### The runtime gates writes

`src/ai/runtime.ts` runs a small model ↔ tool loop (bounded by
`MAX_TOOL_ITERATIONS`). Read tools run immediately; the first write tool the
model requests ends the turn as a **proposal** (`status: awaiting_confirmation`)
and does nothing. Only a later turn carrying an explicit `confirm` runs that one
write. `src/ai/prompt.ts` carries the doctrine and hard refusals, and a
last-resort `refusalFor` stops the plainest unsafe prompts before the model is
called — but the real gate is code: the role matrix and the confirmation step.

### Persistence and audit

`src/db/schema.ts` adds `ai_threads`, `ai_messages`, `ai_tool_calls`, and
`ai_message_embeddings` (migration `drizzle/0021_*`). Every row is
`organizationId`-scoped, and a thread is only readable by its user. `src/db/ai.ts`
is the store; a tool that runs writes an `assistant.<tool>` audit row via
`auditToolRun`, so an action taken by chat is traceable in History beside the
same action taken by hand.

### Retrieval over message history (#268)

Retrieval is a second, optional port (`EmbeddingProvider`), configured
separately from the chat model (`AI_EMBEDDING_PROVIDER`). `retrieveRelevant`
embeds the query, ranks the organization's embedded messages by cosine
similarity, and returns the top-k with thread citations. Scope is enforced twice:
the candidate load is org-scoped in the store, and the `allow` predicate is where
a caller passes the entity-scope rule (and excludes the current turn's own
message).

**Messages are embedded as they are written**, not on a nightly job:
`indexMessageEmbedding` runs right after every `appendMessage` (user and
assistant turns, and a confirmation result). It is **awaited**, because on
Cloudflare a detached promise may be cancelled once the response ends — that is
what makes retrieval recall a fact from an earlier turn immediately. It never
blocks or breaks a turn: it returns false on no embedder, short content, a
provider error, or a 10s timeout, and the message simply stays unembedded. A
bounded sweep in the indexer cron (`backfillAllEmbeddings`) catches up anything
that missed, and `pnpm ai:embed-backfill` remains the manual path. Retrieval
itself is best-effort — a failure degrades to "no memory" and the turn still
runs.

### Frontend: assistant-ui, with the backend authoritative (#267)

The chat panel is built on [`assistant-ui`](https://www.assistant-ui.com/)
(React 19-compatible), chosen over Vercel AI Elements and a bespoke build because
it ships an **approval gate** that maps exactly to our preview→confirm model,
plus composable **headless primitives** we style with our own design tokens
rather than its defaults. We do **not** adopt its runtime as our agent runtime:
our provider-agnostic port, tool loop, and confirm gate stay authoritative.

- `src/components/chat/chat-adapter.ts` is a `ChatModelAdapter` that talks to
  our `/api/chat` NDJSON route. A read turn streams to text and tool cards; a
  **write** arrives as `awaiting_confirmation` and is emitted as a tool-call part
  carrying an `approval` gate, which pauses the run. When the user decides, the
  runtime resumes the adapter, which posts the decision to our
  `confirmToolCallAction` — the only path that runs a write.
- `src/components/chat/chat-panel.tsx` is the surface: mounted from
  `DashboardShell`, so it is available on **every** dashboard page. It is a
  bottom-right floating launcher; opened, it is a floating window on small
  screens and a docked right sidebar on `lg` and up. It restores the user's
  latest conversation from our store and offers a history list and a new
  conversation; switching threads remounts the runtime by key. `MotionConfig`
  handles reduced motion, only opacity/transform animate, and a focus trap plus
  `aria-modal` keep it keyboard- and screen-reader-usable.
- `src/components/chat/chat-tool-card.tsx` renders the confirmation card from a
  **side-effect-free preview** the tool provides (`AgentTool.preview`). It shows
  the action's key fields; for a journal, the balanced lines; for an on-chain
  prepare, the unsigned transaction (cluster, program, fee payer, subject) and
  the signing handoff — the assistant never signs. Confirm and Cancel run only
  after a decision, and the receipt links to the recorded action in History.
- `assistantEnabled` (from `assistantConfigured()`) and `assistantMemory` (from
  `embeddingConfigured()`) are read on the server and passed to the panel, so an
  unconfigured deployment shows a clear "assistant is off" state, never an error.

### Voice and speech

`src/ai/speech/` adds text-to-speech. The ElevenLabs key is **server-only**: the
browser asks our own `/api/speech` route (session-guarded), which calls
ElevenLabs and returns `audio/mpeg`. `ELEVENLABS_API_KEY` unset means speech is
off and the Speak control is not offered.

- `createElevenLabsSpeechAdapter` (`src/components/chat/speech-adapter.ts`) is an
  assistant-ui `SpeechSynthesisAdapter` that speaks a reply through our route, so
  no key reaches the client. It is wired into the runtime only when
  `speechConfigured()`.
- Each assistant message gets a **Read aloud** control (`ActionBarPrimitive`),
  and the composer gets **dictation** (`ComposerPrimitive.Dictate`) using the
  browser's own speech recognition, which needs no key.
- On a free ElevenLabs plan, the API rejects **library** voices; the default is a
  **premade** voice (`ELEVENLABS_VOICE_ID`, default Adam) that works on the free
  tier. A hosted plan can point at any voice.

Speech is a read-only capability: it changes no books, so it needs no
confirmation.

### Per-organization provider & model selection (#289)

An **owner or admin** (`ai.manage`) can switch the organization between the
providers this deployment has keys for and choose a model, from the chat panel's
header, without a redeploy.

- `organization_settings.ai_provider` / `ai_model` store the choice;
  `src/ai/settings.ts` reads it (`providerForOrganization`) and layers it over the
  environment with `resolveAiConfig`. The override changes only the **provider and
  model** — keys and base URLs still come from the environment, so a selection can
  never introduce a secret or an endpoint.
- `providerUsable` keeps only providers whose key is present, so the selector
  offers just the options this deployment can actually reach.
- `src/ai/models.ts` is a curated catalog (including **free** models, marked),
  with a note that only models that call tools are offered.
- `getAiSettingsAction` (any session, read-only), `setAiSelectionAction` and
  `resetAiSelectionAction` (owner/admin) — see `src/app/dashboard/ai-actions.ts`.
- `ModelSelector` renders in the panel header only when `canManageAi` is true.

The chat route and actions resolve the provider through
`providerForOrganization`, so a switch takes effect on the next turn.

### Platform administration (#290)

`/dashboard/platform` is a cross-organization view for **platform admins**:
every organization with its user/entity counts and owners, and every user with
the organization they belong to, role, status, verification, and last sign-in.

Platform admin is **not** an organization role — an org owner or admin must not
see other tenants. It is an explicit allowlist of emails
(`PLATFORM_ADMIN_EMAILS`, server-only). `isPlatformAdmin`/`requirePlatformAdmin`
gate the panel and its actions; an email not on the list is redirected home. The
panel can deactivate/reactivate any user, and each change is audited in the
affected user's organization.

## Why

- **No new dependency.** A port plus `fetch` adapters keeps the default install
  unchanged and every provider testable offline, matching the repository's
  existing adapter discipline.
- **One place the rules live.** Permissions, entity scope and the confirmation
  gate are code in `src/ai/`; the prompt is guidance, not enforcement.
- **Auditable by construction.** A chat action writes the same audit event a UI
  action does; nothing bypasses RBAC or Approvals.
- **Provider-neutral.** Adding a provider is one adapter plus a registry entry;
  the coverage test enforces its contract.

## Consequences

- The assistant is off until `AI_PROVIDER` is set; every caller handles null,
  like the contract features.
- A write always needs a confirmation turn; the chat cannot "just do it" even for
  an owner. This is deliberate and matches `docs/ai-chatbot.md` §5.
- Retrieval scans embeddings in memory per org. At this scale it is enough; a
  `pgvector` index is the upgrade path when history grows (recorded in #268).
- The panel (sub-epic #267) is built on `assistant-ui` but keeps our backend
  authoritative: the runtime it owns is presentation and the approval gate only.
  A write still needs a confirmation turn; the chat cannot "just do it" even for
  an owner. This is deliberate and matches `docs/ai-chatbot.md` §5.
- The panel adds `@assistant-ui/react`, `@assistant-ui/react-markdown`, and
  `zustand` to the dependency tree. It is mounted only in the dashboard shell,
  so the public pages and PDF/CSV exports are unaffected.
- Retrieval scans embeddings in memory per org. At this scale it is enough; a
  `pgvector` index is the upgrade path when history grows (recorded in #268).
- Streaming is NDJSON of typed events; provider-native token streaming and
  multi-thread persistence are follow-ups (the port defines `StreamEvent` for
  the former; the store already holds threads for the latter).

## References

- Spec: `docs/ai-chatbot.md`
- Port and adapters: `src/ai/provider.ts`, `src/ai/providers/`, `src/ai/registry.ts`, `src/ai/config.ts`
- Contract: `src/ai/provider-contract.ts`, `src/ai/providers/contract.test.ts`
- Tools: `src/ai/tools/`
- Runtime: `src/ai/runtime.ts`, `src/ai/prompt.ts`
- Service and RAG: `src/ai/service.ts`, `src/ai/retrieval.ts`, `src/ai/embeddings/`
- Store and schema: `src/db/ai.ts`, `src/db/schema.ts`
- Route and actions: `src/app/api/chat/route.ts`, `src/app/dashboard/chat-actions.ts`
- Frontend: `src/components/chat/` (adapter, runtime provider, panel, tool card)
