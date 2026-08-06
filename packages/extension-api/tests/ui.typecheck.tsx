import { Button, DialogClose, DialogTrigger, MenuTrigger } from "../src/ui.ts";

<DialogTrigger render={<Button>Open</Button>} />;
<DialogClose render={(props, state) => <button {...props} disabled={state.disabled} />} />;
<MenuTrigger render={(props, state) => <button {...props} data-open={state.open} />} />;

// @ts-expect-error Base UI composes triggers through `render`, not Radix's `asChild`.
<DialogTrigger asChild />;
// @ts-expect-error Base UI composes triggers through `render`, not Radix's `asChild`.
<DialogClose asChild />;
// @ts-expect-error Base UI composes triggers through `render`, not Radix's `asChild`.
<MenuTrigger asChild />;
