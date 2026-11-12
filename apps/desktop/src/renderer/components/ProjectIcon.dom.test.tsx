import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ProjectIcon from "./ProjectIcon.tsx";
let root: Root;
let container: HTMLDivElement;
afterEach(async()=>{if(root)await act(async()=>root.unmount());container?.remove()});
async function mount(src?:string){container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root.render(<ProjectIcon name=" nativepi" src={src}/>));}
test("uses the first project letter when no file icon is available",async()=>{await mount();expect(container.textContent).toBe('N');expect(container.querySelector('img')).toBeNull()});
test("failed image decoding falls back, and a later icon can recover",async()=>{
  await mount('data:image/png;base64,bad');
  await act(async()=>container.querySelector('img')!.dispatchEvent(new Event('error')));
  expect(container.querySelector('img')).toBeNull();expect(container.textContent).toBe('N');
  await act(async()=>root.render(<ProjectIcon name="nativepi" src="data:image/png;base64,new"/>));
  expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,new');
});
