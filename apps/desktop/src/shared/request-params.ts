import { serviceTierSchema } from "./service-tier.ts";
import { thinkingLevelSchema } from "./pi-values.ts";
import { z } from "zod";
import { extensionCallParamsSchema, nativePiStateSchema, updateChannelSchema, type HostRequests, type HostRequestName, type HostRequestContracts } from "./rpc-schema.ts";
import { piSettingsPatchSchema } from "./pi-settings.ts";
import { tuiClientFrameSchema } from "./tui-frames.ts";
const path = z.string().min(1).max(32767).refine(value => !value.includes("\0"), "Invalid path");
const text = z.string().max(10000000);
const id = z.string().min(1).max(500);
const project = z.object({ projectDir: path });
const session = project.extend({ sessionFile: path });
const target = project.extend({ sessionFile: path.nullable().optional() });
const empty = z.object({});
const thinking = thinkingLevelSchema;
const image = z.object({ type: z.literal("image"), data: z.string().min(1).max(64 * 1024 * 1024), mimeType: z.string().refine(value => ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(value), "Unsupported image type") });
const file = project.extend({ file: path });
const terminal = project.extend({ terminalId: id });
const attach = terminal.extend({ attachmentId: id.optional() });
const complete = target.extend({ lines: z.array(z.string().max(1000000)).max(1000), cursorLine: z.number().int().min(0), cursorCol: z.number().int().min(0) });
const auth = z.object({ projectDir: path.optional(), sessionFile: path.nullable().optional(), providerId: id });
const packageChange = project.extend({ source: id, scope: z.enum(["user", "project"]) });
const branch = project.extend({ branch: id, create: z.boolean() });
const hunks = file.extend({ untracked: z.boolean() });
export const requestParams = {
  workWorkspace: empty, chatWorkspace: empty, pickProject: empty, loadState: empty, saveState: z.object({ state: nativePiStateSchema }), listSessions: project,
  searchSessions: z.object({ requestId: id, projectDirs: z.array(path).max(100), query: z.string().min(1).max(500) }),
  cancelSearchSessions: z.object({ requestId: id }), readSession: z.object({ sessionFile: path }), readSessionSnapshot: session, reloadSession: session,
  ensurePi: target, restartPi: project, restartAllPi: empty, importSession: project.extend({ sourceFile: path.optional() }),
  submit: target.extend({ sessionFile: path.nullable(), message: text, images: z.array(image).max(100).optional(), model: z.object({ provider: id, id }).optional(), thinkingLevel: thinking.optional(), streamingBehavior: z.enum(["steer", "followUp"]).optional() }),
  enqueue: session.extend({ behavior: z.enum(["steer", "followUp"]), message: text, images: z.array(image).max(100).optional() }),
  prepareImages: z.object({ files: z.array(z.object({ name: z.string().max(32767), mimeType: z.string().max(200), data: z.string().max(64 * 1024 * 1024) })).max(100) }),
  getServiceTier: target, setServiceTier: target.extend({ tier: serviceTierSchema, provider: id, modelId: id }),
  getChatTitleModels: z.object({ projectDir: path.optional(), sessionFile: path.nullable().optional() }),
  abort: target, getModels: target, getState: target, getThinkingLevels: target,
  setModel: target.extend({ provider: id, modelId: id }), setThinkingLevel: target.extend({ level: thinking }),
  renameChat: session.extend({ name: z.string().max(10000) }), cloneChat: session, deleteChat: session, watchSession: project.extend({ sessionFile: path.nullable() }), watchProjectSessions: project, unwatchProjectSessions: project,
  getForkPoints: session, forkChat: session.extend({ entryId: id }), getTree: session,
  getUsageDashboard: z.object({ projects: z.array(z.object({ path, name: z.string().min(1).max(200) })).max(100) }),
  getContextInspector: target, compact: session, abortRetry: session, exportHtml: session, listProviders: empty, getSessionProviders: target,
  login: auth.extend({ flowId: z.string().min(1).max(128).optional(), type: z.enum(["api_key", "oauth"]) }), logout: auth,
  authRespond: z.object({ projectDir: path.optional(), flowId: z.string().min(1).max(128).optional(), id, value: z.string().max(100000).optional(), cancel: z.boolean().optional() }),
  checkTrust: project, setTrust: project.extend({ trusted: z.boolean() }),
  windowMinimize: empty, windowToggleMaximize: empty, windowClose: empty, confirmQuit: empty, windowIsMaximized: empty, windowIsFullScreen: empty,
  openExternal: z.object({ url: z.string().url().max(32767).refine(value => /^(https?:|mailto:)/i.test(value)) }), listEditors: empty,
  openProjectIn: project.extend({ editorId: id }), openFileIn: file.extend({ editorId: id, line: z.number().int().positive().optional(), column: z.number().int().positive().optional() }),
  readProjectDiffPreview: file.extend({ mode: z.enum(["working", "staged"]) }),
  readProjectImage: file, readProjectMedia: file, versions: empty, exportDiagnostics: z.object({ projectDir: path.optional() }),
  reportRendererError: z.object({ kind: z.enum(["error", "unhandledRejection"]), message: z.string().max(20000), stack: z.string().max(100000).optional() }),
  updateState: empty, checkForUpdate: empty, setUpdateChannel: z.object({ channel: updateChannelSchema }), installUpdate: empty,
  accessStatus: empty, startLocalAccess: empty, stopLocalAccess: empty, replaceAccessLink: empty, revokeAccess: empty, startRemoteAccess: empty, stopRemoteAccess: empty,
  getPiSettings: empty, setPiSettings: z.object({ patch: piSettingsPatchSchema }), piPaths: empty, showInFolder: z.object({ path }),
  saveImage: z.object({ data: image.shape.data, mimeType: image.shape.mimeType, suggestedName: z.string().min(1).max(255) }),
  terminalEnsure: project.extend({ shellId: id.optional() }), terminalCreate: project.extend({ shellId: id.optional(), name: z.string().max(64).optional() }), terminalListShells: empty,
  terminalRename: terminal.extend({ name: z.string().min(1).max(64) }), terminalRestart: terminal, terminalAttach: attach, terminalDetach: attach,
  terminalWrite: terminal.extend({ data: z.string().max(64 * 1024) }), terminalResize: terminal.extend({ cols: z.number().int().min(2).max(1000), rows: z.number().int().min(1).max(1000) }), terminalClear: terminal, terminalClose: terminal, terminalCloseProject: project,
  gitStatus: project, gitLog: project.extend({ query: z.string().max(500).optional(), limit: z.number().int().min(1).max(1000).optional() }),
  gitCommitDetails: project.extend({ hash: z.string().regex(/^[a-f0-9]{40,64}$/) }),
  gitCommitDiff: file.extend({ hash: z.string().regex(/^[a-f0-9]{40,64}$/) }), gitDiff: hunks.extend({ staged: z.boolean().optional() }), gitHunks: hunks, gitStageHunk: hunks.extend({ patch: text }), gitRevertFile: file, gitStageFile: file, gitUnstageFile: file.extend({ originalPath: path.optional() }), gitStageAll: project, gitUnstageAll: project,
  gitGenerateCommitMessage: target.extend({ model: id.optional() }), gitCommit: project.extend({ message: z.string().trim().min(1).max(10000) }), gitPush: project, gitSync: project, gitPrTarget: project,
  gitPushAndCreatePr: project.extend({ title: z.string().trim().min(1).max(256), body: z.string().max(50000), expectedTarget: z.object({ branch: z.string().optional(), base: z.string().optional(), remote: z.string().optional(), blocker: z.string().optional() }).optional() }), gitBranches: project, gitCheckout: branch, gitAddWorktree: branch, repoHostContext: project,
  listCommands: target, listSkills: project, listProjectFiles: project, readProjectDirectory: project.extend({ path: z.string().max(32767) }), watchProjectDirectories: project.extend({ paths: z.array(z.string().max(32767)).max(500) }),
  listPackages: project, installPackage: packageChange, removePackage: packageChange, updatePackage: project.extend({ source: id.optional() }), loadGraphicalExtensions: project, callExtension: extensionCallParamsSchema,
  extensionRespond: target.extend({
    response: z.union([
      z.object({ type: z.literal("extension_ui_response"), id, value: text }),
      z.object({ type: z.literal("extension_ui_response"), id, confirmed: z.boolean() }),
      z.object({ type: z.literal("extension_ui_response"), id, cancelled: z.literal(true) }),
    ])
  }),
  tuiSend: target.extend({ frame: tuiClientFrameSchema }), tuiComplete: complete, tuiApply: complete.extend({ item: z.object({ value: text, label: text, description: text.optional() }), prefix: z.string().max(200) }),
} satisfies Record<keyof HostRequestContracts, z.ZodType>;
export function validateHostRequest<K extends HostRequestName>(name: K, params: unknown): HostRequests[K]["params"] {
  if (!Object.hasOwn(requestParams, name))
    throw new Error(`Unknown host request: ${String(name)}`);
  return requestParams[name].parse(params ?? {}) as HostRequests[K]["params"];
}
