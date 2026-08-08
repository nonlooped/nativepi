import type { Metadata } from "next";
import Link from "next/link";

import { H2, H3, Note, PageTitle, Prose } from "@/components/docs/Prose";
import { Code } from "@/components/site/Code";

export const metadata: Metadata = {
  title: "Shared extension UI",
  description: "Use NativePi-provided buttons, fields, dialogs, menus, selects, settings rows, CSS variables, and icons in graphical renderers.",
};

export default function SharedUiPage() {
  return (
    <>
      <PageTitle
        eyebrow="Extension guides"
        title="Shared UI"
        lede="Import host-provided components so graphical extensions match NativePi's density, interaction states, and active surface without bundling a second component system."
      />

      <H2 id="import">Import components</H2>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@nativepi/extension-api/ui";`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          These components resolve only inside NativePi. Importing them in the Pi
          entry or rendering them in a standalone browser throws an explicit host
          error.
        </p>
      </Prose>

      <H2 id="components">Component groups</H2>
      <Prose>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr><th>Group</th><th>Exports</th></tr>
            </thead>
            <tbody>
              <tr><td>Actions</td><td><code>Button</code>, <code>Badge</code></td></tr>
              <tr><td>Inputs</td><td><code>Input</code>, <code>Textarea</code>, <code>Label</code>, <code>Switch</code>, <code>Separator</code></td></tr>
              <tr><td>Fields</td><td><code>Field</code>, <code>FieldContent</code>, <code>FieldDescription</code>, <code>FieldError</code>, <code>FieldGroup</code>, <code>FieldLabel</code></td></tr>
              <tr><td>Dialogs</td><td><code>Dialog</code>, <code>DialogTrigger</code>, <code>DialogClose</code>, <code>DialogContent</code>, <code>DialogHeader</code>, <code>DialogFooter</code>, <code>DialogTitle</code>, <code>DialogDescription</code></td></tr>
              <tr><td>Menus</td><td><code>Menu</code>, <code>MenuTrigger</code>, <code>MenuContent</code>, <code>MenuGroup</code>, <code>MenuLabel</code>, <code>MenuItem</code>, <code>MenuSeparator</code></td></tr>
              <tr><td>Selects</td><td><code>Select</code>, <code>SelectTrigger</code>, <code>SelectValue</code>, <code>SelectContent</code>, <code>SelectGroup</code>, <code>SelectLabel</code>, <code>SelectItem</code>, <code>SelectSeparator</code></td></tr>
            </tbody>
          </table>
        </div>
      </Prose>

      <H2 id="buttons">Buttons and badges</H2>
      <Prose>
        <p>
          Button variants are <code>default</code>, <code>secondary</code>,{" "}
          <code>destructive</code>, <code>outline</code>, <code>ghost</code>, and{" "}
          <code>link</code>. Sizes are <code>default</code>, <code>xs</code>,{" "}
          <code>sm</code>, <code>lg</code>, <code>xl</code>, and matching icon
          sizes. Badge supports the same variants.
        </p>
      </Prose>

      <H2 id="dialogs-and-menus">Dialogs and menus</H2>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`<Dialog>
  <DialogTrigger render={<Button variant="outline">Open details</Button>} />
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Query details</DialogTitle>
      <DialogDescription>Review the query before running it.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <DialogClose render={<Button variant="ghost">Cancel</Button>} />
      <Button>Run query</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>`}
        />
      </div>
      <Prose className="mt-4">
        <p>
          Triggers follow Base UI composition. Pass an element through{" "}
          <code>render</code>; do not use Radix&apos;s <code>asChild</code> pattern.
          Menu and select content accept side, alignment, and offset props for
          placement.
        </p>
      </Prose>

      <H3 id="menu-example">Menu example</H3>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`<Menu>
  <MenuTrigger render={<Button size="sm" variant="ghost">Actions</Button>} />
  <MenuContent align="end">
    <MenuLabel>Result actions</MenuLabel>
    <MenuItem onClick={() => void context.actions.copyText(result)}>Copy result</MenuItem>
    <MenuSeparator />
    <MenuItem variant="destructive" onClick={clearResult}>Clear result</MenuItem>
  </MenuContent>
</Menu>`}
        />
      </div>

      <H2 id="settings-rows">Settings rows</H2>
      <Prose>
        <ul>
          <li><code>SettingsActionRow</code>: label, optional description, and custom child action</li>
          <li><code>SettingsSwitchRow</code>: boolean value with <code>onChange</code></li>
          <li><code>SettingsSelectRow</code>: string value, options, and <code>onChange</code></li>
          <li><code>SettingsTextRow</code>: text or multiline value committed through <code>onCommit</code></li>
          <li><code>SettingsSliderRow</code>: bounded numeric value, step, formatter, and <code>onChange</code></li>
        </ul>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`<SettingsSwitchRow
  label="Confirm destructive queries"
  description="Ask before running DELETE, DROP, or TRUNCATE."
  checked={settings.confirmDestructive}
  onChange={(checked) => void updateSettings({ confirmDestructive: checked })}
/>`}
        />
      </div>

      <H2 id="styling">Extension-specific styling</H2>
      <Prose>
        <p>
          NativePi&apos;s Tailwind build runs before renderer source is compiled, so
          package-specific utility classes do not generate CSS. Use inline styles
          for small layouts and semantic variables for color:
        </p>
        <ul>
          <li><code>var(--foreground)</code></li>
          <li><code>var(--muted-foreground)</code></li>
          <li><code>var(--border)</code></li>
          <li><code>var(--destructive)</code></li>
          <li><code>var(--warning)</code></li>
          <li><code>var(--success)</code></li>
        </ul>
      </Prose>
      <div className="measure mt-4">
        <Code
          lang="tsx"
          code={`<div
  style={{
    display: "grid",
    gap: 8,
    color: "var(--foreground)",
    borderBlockEnd: "1px solid var(--border)",
  }}
>
  {children}
</div>`}
        />
      </div>

      <H2 id="icons">Icons</H2>
      <Prose>
        <p>
          Use Phosphor icons to match NativePi. Mark an icon inside a button with
          <code> data-icon=&quot;inline-start&quot;</code> or{" "}
          <code>data-icon=&quot;inline-end&quot;</code> so spacing follows the button
          component.
        </p>
      </Prose>

      <Note>
        Keep custom motion optional and meaningful. NativePi neutralizes
        animation under <code>prefers-reduced-motion</code>; every state must
        remain understandable without it.
      </Note>

      <H2 id="reference">Type reference</H2>
      <Prose>
        <p>
          Exact prop interfaces are listed in the{" "}
          <Link href="/docs/extension-api/reference#ui-exports">API reference</Link>{" "}
          and exported from <code>@nativepi/extension-api/ui</code> for editor
          completion.
        </p>
      </Prose>
    </>
  );
}
