import { useEffect, useId, useState } from "react";
import type { CSSProperties } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { GlobeSimpleIcon } from "@phosphor-icons/react/GlobeSimple";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { ProhibitIcon } from "@phosphor-icons/react/Prohibit";
import { TerminalWindowIcon } from "@phosphor-icons/react/TerminalWindow";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { defineRenderer } from "@nativepi/extension-api";
import type { RendererContext } from "@nativepi/extension-api";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Textarea,
} from "@nativepi/extension-api/ui";
import {
  mcpProtocol,
  type EditableMcpServer,
  type McpScope,
  type McpServerEntry,
  type McpState,
} from "../types.ts";

type Context = RendererContext<typeof mcpProtocol>;
const stateCache = new Map<string, McpState>();

type Draft = {
  originalName?: string;
  scope: McpScope;
  name: string;
  transport: "stdio" | "http";
  command: string;
  args: string;
  cwd: string;
  url: string;
  metadata: string;
};

const stack = { display: "flex", flexDirection: "column", gap: "0.75rem" } satisfies CSSProperties;
const row = { display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" } satisfies CSSProperties;
const fieldGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))",
  gap: "1rem",
} satisfies CSSProperties;
const mono = "ui-monospace, SFMono-Regular, Consolas, monospace";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function emptyDraft(projectTrusted: boolean): Draft {
  return {
    scope: projectTrusted ? "project" : "user",
    name: "",
    transport: "stdio",
    command: "",
    args: "",
    cwd: "",
    url: "",
    metadata: "",
  };
}

function draftFor(server: McpServerEntry): Draft {
  const config = server.config;
  return {
    originalName: server.name,
    scope: server.scope,
    name: server.name,
    transport: config.transport,
    command: config.transport === "stdio" ? config.command : "",
    args: config.transport === "stdio" ? config.args.join("\n") : "",
    cwd: config.transport === "stdio" ? config.cwd ?? "" : "",
    url: config.transport === "http" ? config.url : "",
    metadata: JSON.stringify(
      config.transport === "stdio" ? config.env ?? {} : config.headers ?? {},
      null,
      2,
    ),
  };
}

function stringMap(value: string, label: string) {
  if (!value.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  const values: Record<string, string> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (typeof entry !== "string") throw new Error(`${label} value “${key}” must be text.`);
    if (/[\r\n]/.test(entry)) throw new Error(`${label} values cannot contain line breaks.`);
    values[key] = entry;
  }
  return values;
}

export function configFor(draft: Draft): EditableMcpServer {
  if (draft.transport === "http") {
    const headers = stringMap(draft.metadata, "Headers");
    return {
      transport: "http",
      url: draft.url.trim(),
      ...(headers ? { headers } : {}),
    };
  }
  const cwd = draft.cwd.trim();
  const env = stringMap(draft.metadata, "Environment variables");
  return {
    transport: "stdio",
    command: draft.command.trim(),
    args: draft.args ? draft.args.split(/\r?\n/) : [],
    ...(cwd ? { cwd } : {}),
    ...(env ? { env } : {}),
  };
}

export function saveParametersFor(draft: Draft, config: EditableMcpServer) {
  return {
    scope: draft.scope,
    ...(draft.originalName === undefined ? {} : { originalName: draft.originalName }),
    name: draft.name.trim(),
    config,
  };
}

function endpoint(server: McpServerEntry) {
  const config = server.config;
  return config.transport === "http"
    ? config.url
    : [config.command, ...config.args].join(" ");
}

function ServerEditor({
  context,
  draft,
  projectTrusted,
  busy,
  onChange,
  onClose,
  onSaved,
}: {
  context: Context;
  draft: Draft;
  projectTrusted: boolean;
  busy: boolean;
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSaved: (state: McpState) => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [advanced, setAdvanced] = useState(Boolean(draft.cwd || draft.metadata));
  const editing = draft.originalName !== undefined;
  const scopeLabel = draft.scope === "project" ? "this project" : "every project";

  const submit = () => {
    if (busy || saving) return;
    setError(null);
    let config: EditableMcpServer;
    try {
      config = configFor(draft);
    } catch (reason) {
      setError(errorMessage(reason));
      return;
    }
    setSaving(true);
    void context.channel.call("save", saveParametersFor(draft, config)).then((state) => {
      stateCache.set(`${context.project.path}\0${context.session.file ?? ""}`, state);
      onSaved(state);
      onClose();
      const saved = state.servers.find((server) => server.scope === draft.scope && server.name === draft.name.trim());
      if (saved?.status === "error") {
        context.actions.notify(`MCP server saved, but it could not connect: ${saved.error ?? "Unknown error"}`, "warning");
      } else {
        context.actions.notify(editing ? "MCP server updated" : "MCP server added", "info");
      }
    }).catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent style={{ maxWidth: "36rem", maxHeight: "calc(100dvh - 2rem)", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit MCP server" : "Add MCP server"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update this connection. Pi reconnects when you save." : "Enter the connection details supplied by the server."}
          </DialogDescription>
        </DialogHeader>
        <form
          style={{ ...stack, gap: "1rem" }}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <FieldGroup style={{ ...stack, gap: "1rem" }}>
            <div style={fieldGrid}>
              <Field>
                <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
                <Input
                  id={`${id}-name`}
                  value={draft.name}
                  placeholder="filesystem"
                  required
                  disabled={busy}
                  onChange={(event) => onChange({ ...draft, name: event.target.value })}
                />
                <FieldDescription>A short name for this server.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-transport`}>Connection</FieldLabel>
                <Select
                  items={{ stdio: "Local command", http: "Streamable HTTP" }}
                  value={draft.transport}
                  disabled={busy}
                  onValueChange={(value) => {
                    if (value === "stdio" || value === "http") onChange({ ...draft, transport: value });
                  }}
                >
                  <SelectTrigger id={`${id}-transport`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="stdio">Local command</SelectItem>
                      <SelectItem value="http">Streamable HTTP</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {draft.transport === "stdio" ? (
              <>
                <Field>
                  <FieldLabel htmlFor={`${id}-command`}>Command</FieldLabel>
                  <Input
                    id={`${id}-command`}
                    value={draft.command}
                    placeholder="npx"
                    required
                    disabled={busy}
                    spellCheck={false}
                    style={{ fontFamily: mono }}
                    onChange={(event) => onChange({ ...draft, command: event.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-args`}>Arguments</FieldLabel>
                  <Textarea
                    id={`${id}-args`}
                    value={draft.args}
                    placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path/to/project"}
                    disabled={busy}
                    spellCheck={false}
                    style={{ minHeight: "6rem", fontFamily: mono }}
                    onChange={(event) => onChange({ ...draft, args: event.target.value })}
                  />
                  <FieldDescription>Enter one argument per line.</FieldDescription>
                </Field>
              </>
            ) : (
              <Field>
                <FieldLabel htmlFor={`${id}-url`}>Endpoint URL</FieldLabel>
                <Input
                  id={`${id}-url`}
                  type="url"
                  value={draft.url}
                  placeholder="https://example.com/mcp"
                  required
                  disabled={busy}
                  spellCheck={false}
                  style={{ fontFamily: mono }}
                  onChange={(event) => onChange({ ...draft, url: event.target.value })}
                />
              </Field>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={advanced}
              onClick={() => setAdvanced((open) => !open)}
              style={{ alignSelf: "flex-start", color: "var(--muted-foreground)" }}
            >
              <CaretDownIcon
                data-icon="inline-start"
                style={{ transform: advanced ? "rotate(180deg)" : undefined, transition: "transform 150ms ease" }}
              />
              Advanced settings
            </Button>

            {advanced ? (
              <div style={{ ...stack, gap: "1rem", paddingTop: "0.25rem" }}>
                <Separator />
                {!editing ? (
                  <Field>
                    <FieldLabel htmlFor={`${id}-scope`}>Available to</FieldLabel>
                    <Select
                      items={{ user: "Every project", project: "This project" }}
                      value={draft.scope}
                      disabled={busy}
                      onValueChange={(value) => {
                        if (value === "user" || value === "project") onChange({ ...draft, scope: value });
                      }}
                    >
                      <SelectTrigger id={`${id}-scope`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="user">Every project</SelectItem>
                          <SelectItem value="project" disabled={!projectTrusted}>This project</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {!projectTrusted ? <FieldDescription>Trust this project to save a project-only server.</FieldDescription> : null}
                  </Field>
                ) : (
                  <FieldDescription>This server is available to {scopeLabel}.</FieldDescription>
                )}
                {draft.transport === "stdio" ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor={`${id}-cwd`}>Working directory</FieldLabel>
                      <Input
                        id={`${id}-cwd`}
                        value={draft.cwd}
                        placeholder="/path/to/project"
                        disabled={busy}
                        spellCheck={false}
                        style={{ fontFamily: mono }}
                        onChange={(event) => onChange({ ...draft, cwd: event.target.value })}
                      />
                      <FieldDescription>Optional. Relative paths start from the configuration file.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${id}-metadata`}>Environment variables</FieldLabel>
                      <Textarea
                        id={`${id}-metadata`}
                        value={draft.metadata}
                        placeholder={'{\n  "TOKEN": "value"\n}'}
                        disabled={busy}
                        spellCheck={false}
                        style={{ minHeight: "6rem", fontFamily: mono }}
                        onChange={(event) => onChange({ ...draft, metadata: event.target.value })}
                      />
                      <FieldDescription>Optional JSON object stored in Pi’s MCP configuration file.</FieldDescription>
                    </Field>
                  </>
                ) : (
                  <Field>
                    <FieldLabel htmlFor={`${id}-metadata`}>Request headers</FieldLabel>
                    <Textarea
                      id={`${id}-metadata`}
                      value={draft.metadata}
                      placeholder={'{\n  "Authorization": "Bearer token"\n}'}
                      disabled={busy}
                      spellCheck={false}
                      style={{ minHeight: "6rem", fontFamily: mono }}
                      onChange={(event) => onChange({ ...draft, metadata: event.target.value })}
                    />
                    <FieldDescription>Optional JSON object stored in Pi’s MCP configuration file.</FieldDescription>
                  </Field>
                )}
              </div>
            ) : null}
          </FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy || saving}>Cancel</Button>
            <Button type="submit" disabled={busy || saving || !draft.name.trim()}>
              {saving ? "Saving..." : editing ? "Save server" : "Add server"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveServerDialog({ server, busy, onClose, onRemove }: {
  server: McpServerEntry;
  busy: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent style={{ maxWidth: "28rem" }}>
        <DialogHeader>
          <DialogTitle>Remove MCP server?</DialogTitle>
          <DialogDescription>
            Pi will disconnect {server.name} and remove it from {server.scope === "project" ? "this project" : "every project"}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={onRemove} disabled={busy}>Remove server</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServerStatus({ server }: { server: McpServerEntry }) {
  if (server.status === "error") {
    return (
      <span style={{ ...row, flexWrap: "nowrap", color: "var(--destructive)", fontSize: "0.75rem", fontWeight: 500 }}>
        <WarningCircleIcon size={16} weight="fill" />
        Connection failed
      </span>
    );
  }
  if (server.status === "overridden") {
    return (
      <span style={{ ...row, flexWrap: "nowrap", color: "var(--muted-foreground)", fontSize: "0.75rem", fontWeight: 500 }}>
        <ProhibitIcon size={16} />
        Overridden
      </span>
    );
  }
  return (
    <span style={{ ...row, flexWrap: "nowrap", color: "var(--success)", fontSize: "0.75rem", fontWeight: 500 }}>
      <CheckCircleIcon size={16} weight="fill" />
      {server.toolCount} tool{server.toolCount === 1 ? "" : "s"}
    </span>
  );
}

function ServerRow({ server, disabled, onEdit, onRemove }: {
  server: McpServerEntry;
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const TransportIcon = server.config.transport === "http" ? GlobeSimpleIcon : TerminalWindowIcon;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", padding: "0.875rem 0" }}>
      <span
        aria-hidden="true"
        style={{
          display: "flex",
          width: "2.25rem",
          height: "2.25rem",
          flex: "0 0 2.25rem",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--border)",
          borderRadius: "0.5rem",
          background: "var(--muted)",
          color: "var(--foreground)",
        }}
      >
        <TransportIcon size={18} />
      </span>
      <div style={{ minWidth: "12rem", flex: "1 1 16rem" }}>
        <div style={{ ...row, gap: "0.375rem" }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{server.name}</span>
          <Badge variant="outline">{server.scope === "project" ? "Project" : "User"}</Badge>
        </div>
        <p
          title={endpoint(server)}
          style={{
            margin: "0.25rem 0 0",
            overflow: "hidden",
            color: "var(--muted-foreground)",
            fontFamily: mono,
            fontSize: "0.75rem",
            lineHeight: 1.45,
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {endpoint(server)}
        </p>
        {server.error ? (
          <p style={{ margin: "0.25rem 0 0", color: "var(--destructive)", fontSize: "0.75rem", lineHeight: 1.45 }}>
            {server.error}
          </p>
        ) : null}
      </div>
      <div style={{ ...row, marginLeft: "auto", flex: "0 0 auto", flexWrap: "nowrap" }}>
        <ServerStatus server={server} />
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onEdit}>Edit</Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          title={`Remove ${server.name}`}
          aria-label={`Remove ${server.name}`}
          onClick={onRemove}
        >
          <TrashIcon />
        </Button>
      </div>
    </div>
  );
}

function McpSettings({ context }: { context: Context }) {
  const { call, on } = context.channel;
  const cacheKey = `${context.project.path}\0${context.session.file ?? ""}`;
  const [state, setState] = useState<McpState | null>(() => stateCache.get(cacheKey) ?? null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<McpServerEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void call("state").then((value) => {
      stateCache.set(cacheKey, value);
      if (active) setState(value);
    }).catch((reason: unknown) => {
      if (active) setError(errorMessage(reason));
    });
    const off = on("changed", (value) => {
      stateCache.set(cacheKey, value);
      setState(value);
      setError(null);
    });
    return () => {
      active = false;
      off();
    };
  }, [cacheKey, call, on]);

  const remove = () => {
    if (!removing || busy) return;
    setBusy(true);
    setError(null);
    void call("remove", { scope: removing.scope, name: removing.name })
      .then((value) => {
        stateCache.set(cacheKey, value);
        setState(value);
        setRemoving(null);
        context.actions.notify("MCP server removed", "info");
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setBusy(false));
  };

  const running = context.agent.running;
  const servers = state?.servers ?? [];
  const controlsDisabled = busy || running;

  return (
    <div style={{ ...stack, gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <p style={{ margin: 0, maxWidth: "42rem", color: "var(--muted-foreground)", fontSize: "0.8125rem", lineHeight: 1.55 }}>
          {running
            ? "Finish the active turn before changing servers. Existing connections stay available to Pi."
            : "Changes reconnect this chat immediately. Other open chats update when Pi reloads."}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={!state || controlsDisabled}
          onClick={() => state && setDraft(emptyDraft(state.projectTrusted))}
        >
          <PlusIcon data-icon="inline-start" />
          Add server
        </Button>
      </div>

      {!state && !error ? (
        <p style={{ margin: 0, padding: "1rem 0", color: "var(--muted-foreground)", fontSize: "0.8125rem" }}>
          Loading MCP servers...
        </p>
      ) : null}
      {state && servers.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1.25rem 0", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
          <span
            aria-hidden="true"
            style={{ display: "flex", width: "2.25rem", height: "2.25rem", alignItems: "center", justifyContent: "center", borderRadius: "0.5rem", background: "var(--muted)", color: "var(--muted-foreground)" }}
          >
            <TerminalWindowIcon size={18} />
          </span>
          <div>
            <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>No MCP servers</p>
            <p style={{ margin: "0.125rem 0 0", color: "var(--muted-foreground)", fontSize: "0.75rem", lineHeight: 1.45 }}>
              Add a local command or HTTP endpoint to give Pi more tools.
            </p>
          </div>
        </div>
      ) : null}
      {servers.length > 0 ? (
        <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
          {servers.map((server, index) => (
            <div key={`${server.scope}:${server.name}`}>
              {index > 0 ? <Separator /> : null}
              <ServerRow
                server={server}
                disabled={controlsDisabled}
                onEdit={() => setDraft(draftFor(server))}
                onRemove={() => setRemoving(server)}
              />
            </div>
          ))}
        </div>
      ) : null}
      {state?.diagnostics.map((diagnostic, index) => <FieldError key={index}>{diagnostic}</FieldError>)}
      {error ? <FieldError>{error}</FieldError> : null}

      {draft && state ? (
        <ServerEditor
          context={context}
          draft={draft}
          projectTrusted={state.projectTrusted}
          busy={busy}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSaved={setState}
        />
      ) : null}
      {removing ? <RemoveServerDialog server={removing} busy={busy} onClose={() => setRemoving(null)} onRemove={remove} /> : null}
    </div>
  );
}

export default defineRenderer({
  apiVersion: 1,
  protocol: mcpProtocol,
  settings: [
    {
      id: "mcp-servers",
      heading: "MCP servers",
      description: "Connect external tools through local commands or Streamable HTTP.",
      render: (context) => <McpSettings context={context} />,
    },
  ],
});
