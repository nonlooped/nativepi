import type { OrchestrationSnapshot } from "../../shared/orchestration.ts";
import { afterEach, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
Object.defineProperty(globalThis, 'requestAnimationFrame', {value: window.requestAnimationFrame.bind(window), configurable:true});
Object.defineProperty(globalThis, 'cancelAnimationFrame', {value: window.cancelAnimationFrame.bind(window), configurable:true});
const title='A deliberately long thread title that should remain available when visually truncated';
const project={path:'/project',name:'NativePi'};
const session={path:'/session',id:'id',name:title,firstMessage:title,lastPrompt:title,providers:[],messageCount:2,created:'2026-01-02',modified:'2026-01-02'};
const selectChat=mock(async()=>{}),setScope=mock(()=>{});
const onClose=mock(()=>{});
const noop=()=>{};
const state={orchestration: { revision: 0, threads: [] } as OrchestrationSnapshot,workRoot:null as string | null,projects:[project],activeProjectPath:'/project',activeSessionFile:'/session',isNewChat:false,sessionsByProject:{'/project':[session]},sessionLoadStates:{'/project':'loaded'},pinnedChats:[],finishedChats:{},focusedChats:[],focusStartedAt:'2026-01-01',conversations:{},preferences:{preferredEditorId:'explorer'},keybindingOverrides:{},sidebarScope:null as string | null,git:{isRepo:true,branch:'feature/current'},selectChat,setSidebarScope:setScope,addProject:noop,openSettings:noop,newChatIn:noop,removeProject:noop,importSession:noop,refreshSessions:noop,openTerminal:noop,finishChat:noop,returnChatToFocus:noop};
mock.module('../lib/store.ts',()=>({useAppStore:Object.assign((select:(s:unknown)=>unknown)=>select(state),{getState:()=>state})}));
mock.module('../lib/sidebarProjects.ts',()=>({useSidebarProjects:()=>({'/project':{branch:'stale-branch'}}),projectBranch:(git:{branch:string})=>git.branch}));
mock.module('../lib/rpc.ts',()=>({rpc:{request:{watchProjectSessions:async()=>({ok:true})}}}));
mock.module('./LeftSidebar.tsx',()=>({default:({children}:{children:ReactNode})=><aside>{children}</aside>}));
mock.module('./SessionMenu.tsx',()=>({default:({children}:{children:ReactNode})=><>{children}</>}));
mock.module('./WorktreeDialog.tsx',()=>({default:()=>null}));
mock.module('./ConfirmDialog.tsx',()=>({default:()=>null}));
mock.module('./BrandIcon.tsx',()=>({default:()=>null}));
const {default:Sidebar}=await import('./Sidebar.tsx');
let root:Root;let container:HTMLDivElement;
afterEach(async()=>{if(root)await act(async()=>root.unmount());container?.remove();selectChat.mockClear();setScope.mockClear();onClose.mockClear();state.activeSessionFile='/session';state.workRoot=null;state.sidebarScope=null;state.orchestration={revision:0,threads:[]}});
async function mount(overlay=false){container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root.render(<Sidebar presentation={{"/project": {branch: "stale-branch"}}} overlay={overlay} onClose={onClose} onOpenSearch={noop} onOpenNewChat={noop}/>))}
test('compact rows retain the full title, project and fresh branch, without a Focus heading',async()=>{
 await mount();expect([...container.querySelectorAll('h2')].some(h=>h.textContent==='Focus')).toBe(false);
 const label=container.querySelector(`[title="${title}"]`)!;
 expect(label).not.toBeNull();expect(container.textContent).toContain('NativePi · feature/current');expect(container.textContent).not.toContain('stale-branch');
 expect(container.querySelector('[aria-label="Mark finished"]')).not.toBeNull();
});
for (const overlay of [false, true]) test(`clicking the current thread does nothing (overlay ${overlay})`,async()=>{
 await mount(overlay);
 const button=container.querySelector(`[title="${title}"]`)!.closest('button')!;
 await act(async()=>{button.click();button.click()});
 expect(selectChat).not.toHaveBeenCalled();
 expect(onClose).not.toHaveBeenCalled();
});
test('clicking a different thread opens it and closes the overlay',async()=>{
 state.activeSessionFile='/other';await mount(true);
 await act(async()=>(container.querySelector(`[title="${title}"]`)!.closest('button') as HTMLButtonElement).click());
 expect(selectChat).toHaveBeenCalledTimes(1);
 expect(selectChat).toHaveBeenCalledWith('/session','/project');
 expect(onClose).toHaveBeenCalledTimes(1);
});
test('filter icon contains project filtering and preserves project management actions',async()=>{
 await mount();expect(container.querySelector('[aria-label="Filter threads"]')).not.toBeNull();
 await act(async()=>(container.querySelector('[aria-label="Filter threads"]') as HTMLButtonElement).click());
 expect(document.body.textContent).toContain('Projects');expect(document.body.textContent).toContain('Remove from NativePi');
 const all=[...document.querySelectorAll('[role="menuitem"]')].find(el=>el.textContent?.includes('All projects')) as HTMLElement;
 expect(all).toBeDefined();await act(async()=>all.click());expect(setScope).toHaveBeenCalledWith(null);
});

test('project-free threads appear in Work and filter without project removal actions',async()=>{
 state.workRoot='/managed/work';
 Object.assign(state.sessionsByProject,{'/managed/work':[{...session,path:'/device-session',name:'Device diagnostics'}]});
 Object.assign(state.sessionLoadStates,{'/managed/work':'loaded'});
 await mount();
 expect(container.textContent).toContain('Device diagnostics');
 expect(container.textContent).toContain('No project');
 state.sidebarScope='/managed/work';
 await act(async()=>root.render(<Sidebar presentation={{}} onClose={onClose} onOpenSearch={noop} onOpenNewChat={noop}/>));
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
 state.orchestration={revision:1,threads:[{ref:lead,reports:[],readMessageIds:[],inbox:[],pendingDelivery:[],running:false,busy:true,delegates:[child]},{...child,reports:[],readMessageIds:[],inbox:[],pendingDelivery:[],busy:true,delegates:[]}]};
 await mount();
 expect(container.textContent).toContain('Waiting for lead');
 const row=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes('Parallel review'))!;
 await act(async()=>row.click());
 expect(selectChat).toHaveBeenCalledWith('/delegate','/worktree');
});
