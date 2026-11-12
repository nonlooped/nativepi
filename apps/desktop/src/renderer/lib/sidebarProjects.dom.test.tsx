import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GitStatus } from "../../shared/pi-types.ts";
const status=(branch='main', isRepo=true, detached=false): GitStatus => ({isRepo, branch, detached, files:[], ahead:0, behind:0, insertions:0, deletions:0});
const gitStatus=mock(async (_params:{projectDir:string})=>({status:status()}));
const listProjectFiles=mock(async()=>({files:[]}));
const listeners=new Map<string,(event:{projectDir:string})=>void>();
mock.module('./rpc.ts',()=>({rpc:{request:{gitStatus,listProjectFiles,readProjectImage:async()=>({})},events:{on:(name:string,fn:(event:{projectDir:string})=>void)=>{listeners.set(name,fn);return()=>listeners.delete(name)}}}}));
const {useSidebarProjects,projectBranch}=await import('./sidebarProjects.ts');
const p={path:'/project',name:'Project'}, q={path:'/other',name:'Other'};
function Probe({projects}:{projects:typeof p[]}){return <output>{JSON.stringify(useSidebarProjects(projects))}</output>}
let root:Root;let container:HTMLDivElement;
afterEach(async()=>{if(root)await act(async()=>root.unmount());container?.remove();gitStatus.mockReset();gitStatus.mockImplementation(async()=>({status:status()}));listProjectFiles.mockClear();listeners.clear()});
async function mount(){container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root.render(<Probe projects={[p]}/>))}
test('branches are current local refs, with explicit detached and non-repository cases',()=>{
 expect(projectBranch(status('feature/ui'))).toBe('feature/ui');expect(projectBranch(status('hash',true,true))).toBe('Detached HEAD');expect(projectBranch(status('main',false))).toBeUndefined();
});
test('refreshes branch on focus without rescanning icons',async()=>{
 await mount();expect(container.textContent).toContain('main');
 gitStatus.mockImplementation(async()=>({status:status('feature/new')}));
 await act(async()=>window.dispatchEvent(new Event('focus')));
 expect(container.textContent).toContain('feature/new');expect(listProjectFiles).toHaveBeenCalledTimes(1);
});
test('late reads for a removed project cannot overwrite the new list',async()=>{
 let resolve!:(value:{status:GitStatus})=>void;
 gitStatus.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));
 await mount();await act(async()=>root.render(<Probe projects={[q]}/>));
 await act(async()=>resolve({status:status('old-branch')}));
 expect(container.textContent).not.toContain('/project');expect(container.textContent).toContain('/other');
});
