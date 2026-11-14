import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppStore } from "../lib/store.ts";
import { stubInvoke } from "../lib/store/testBridge.ts";

Object.defineProperty(globalThis, 'requestAnimationFrame', {value: window.requestAnimationFrame.bind(window), configurable:true});
Object.defineProperty(globalThis, 'cancelAnimationFrame', {value: window.cancelAnimationFrame.bind(window), configurable:true});
const title='A deliberately long thread title that should remain available when visually truncated';
const project={path:'/project',name:'NativePi'};
const session={path:'/session',id:'id',name:title,firstMessage:title,lastPrompt:title,providers:[],messageCount:2,created:'2026-01-02',modified:'2026-01-02'};
const noop=()=>{};
const original = useAppStore.getState();
const reads: unknown[] = [];
beforeEach(() => {
  useAppStore.setState({ ...original, ready: false, destination: "work", workRoot: null, projects: [project],
    activeProjectPath: "/project", activeSessionFile: "/session", isNewChat: false,
    sessionsByProject: { "/project": [session] }, sessionLoadStates: { "/project": "loaded" },
    pinnedChats: [], finishedChats: {}, focusedChats: [], focusStartedAt: "2026-01-01", conversations: {}, sidebarScope: null,
    git: { isRepo: true, branch: "feature/current", detached: false, files: [], ahead: 0, behind: 0, insertions: 0, deletions: 0 } });
  reads.length = 0;
  stubInvoke(async (channel, params: any) => {
    if (channel === "readSessionSnapshot") { reads.push(params); return { entries: [], consistency: "stable", eventWatermark: 0 }; }
    if (channel === "orchestrationSnapshot") return useAppStore.getState().orchestration;
    if (channel === "listSessions") return { sessions: useAppStore.getState().sessionsByProject[params.projectDir] ?? [] };
    if (channel === "checkTrust") return { required: true, trusted: false };
    return {};
  });
});
mock.module('./LeftSidebar.tsx',()=>({default:({children}:{children:ReactNode})=><aside>{children}</aside>}));
mock.module('./SessionMenu.tsx',()=>({default:({children}:{children:ReactNode})=><>{children}</>}));
mock.module('./WorktreeDialog.tsx',()=>({default:()=>null}));
mock.module('./ConfirmDialog.tsx',()=>({default:()=>null}));
mock.module('./BrandIcon.tsx',()=>({default:()=>null}));
const {default:Sidebar}=await import('./Sidebar.tsx');
let root:Root;let container:HTMLDivElement;
afterEach(async()=>{if(root)await act(async()=>root.unmount());container?.remove();useAppStore.setState(original, true)});
function Surface({ overlay = false }: { overlay?: boolean }) {
  const [open, setOpen] = useState(true);
  return open ? <Sidebar presentation={{ "/project": { branch: "stale-branch" } }} overlay={overlay} onClose={() => setOpen(false)} onOpenSearch={noop} onOpenNewChat={noop} /> : null;
}
async function mount(overlay=false){container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root.render(<Surface overlay={overlay}/>))}
test('thread labels retain the full title and the current project branch',async()=>{
 await mount();
 const label=container.querySelector(`[title="${title}"]`)!;
 expect(label).not.toBeNull();expect(container.textContent).toContain('NativePi · feature/current');expect(container.textContent).not.toContain('stale-branch');
 expect(container.querySelector('[aria-label="Mark finished"]')).not.toBeNull();
});
for (const overlay of [false, true]) test(`clicking the current thread does nothing (overlay ${overlay})`,async()=>{
 await mount(overlay);
 const button=container.querySelector(`[title="${title}"]`)!.closest('button')!;
 await act(async()=>{button.click();button.click()});
 expect(reads).toEqual([]);
 expect(useAppStore.getState().activeSessionFile).toBe('/session');
 expect(container.querySelector(`[title="${title}"]`)).not.toBeNull();
});
test('clicking a different thread opens it and closes the overlay',async()=>{
 useAppStore.setState({ activeSessionFile: '/other' });await mount(true);
 await act(async()=>(container.querySelector(`[title="${title}"]`)!.closest('button') as HTMLButtonElement).click());
 expect(reads).toEqual([{ projectDir: '/project', sessionFile: '/session' }]);
 expect(useAppStore.getState()).toMatchObject({ activeSessionFile: '/session', activeProjectPath: '/project' });
 expect(container.textContent).toBe('');
});
test('filter icon contains project filtering and preserves project management actions',async()=>{
 useAppStore.setState({ sidebarScope: '/project' });
 await mount();expect(container.querySelector('[aria-label="Filter threads"]')).not.toBeNull();
 await act(async()=>(container.querySelector('[aria-label="Filter threads"]') as HTMLButtonElement).click());
 expect(document.body.textContent).toContain('Projects');expect(document.body.textContent).toContain('Remove from NativePi');
 const all=[...document.querySelectorAll('[role="menuitem"]')].find(el=>el.textContent?.includes('All projects')) as HTMLElement;
 expect(all).toBeDefined();await act(async()=>all.click());expect(useAppStore.getState().sidebarScope).toBeNull();
});

test('project-free threads appear in Work and filter without project removal actions',async()=>{
 useAppStore.setState(state => ({ workRoot: '/managed/work',
   sessionsByProject: { ...state.sessionsByProject, '/managed/work': [{ ...session, path: '/device-session', name: 'Device diagnostics' }] },
   sessionLoadStates: { ...state.sessionLoadStates, '/managed/work': 'loaded' },
 }));
 await mount();
 expect(container.textContent).toContain('Device diagnostics');
 expect(container.textContent).toContain('No project');
 await act(async () => useAppStore.setState({ sidebarScope: '/managed/work' }));
 expect(container.textContent).toContain('Device diagnostics');
 expect(container.querySelector(`[title="${title}"]`)).toBeNull();
 await act(async()=>(container.querySelector('[aria-label="Filter threads"]') as HTMLButtonElement).click());
 expect(document.body.textContent).not.toContain('Remove from NativePi');
 expect(document.body.textContent).toContain('No project');
});

test('delegate rows stay under their lead and navigate using the actual worktree cwd', async () => {
 const lead={id:'id',cwd:'/project',file:'/session'};
 const ref={id:'delegate',cwd:'/worktree',file:'/delegate'};
 const relationship={operationId:'spawn',lead,delegate:ref,label:'Parallel review',configuration:{provider:'p',model:'m',reasoning:'off' as const,tools:['read']},workspace:{mode:'worktree' as const,path:ref.cwd,branch:'review',base:'commit',repository:lead.cwd}};
 const child={ref,relationship,assignment:{id:'assignment',delegate:ref,taskMessageId:'task',attempt:1,state:'waiting' as const,questions:['question']},running:false};
 useAppStore.setState({ orchestration: {revision:1,threads:[{ref:lead,reports:[],readMessageIds:[],inbox:[],pendingDelivery:[],running:false,busy:true,delegates:[child]},{...child,reports:[],readMessageIds:[],inbox:[],pendingDelivery:[],busy:true,delegates:[]}] } });
 await mount();
 expect(container.textContent).toContain('Waiting for lead');
 const row=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes('Parallel review'))!;
 await act(async()=>row.click());
 expect(useAppStore.getState()).toMatchObject({ activeSessionFile: '/delegate', activeProjectPath: '/worktree' });
 expect(reads).toEqual([{ projectDir: '/worktree', sessionFile: '/delegate' }]);
});
