import {
  Badge,
  Button,
  DialogClose,
  DialogTrigger,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  MenuTrigger,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSelectRow,
  Switch,
} from "../src/ui.ts";

<DialogTrigger render={<Button>Open</Button>} />;
<DialogClose render={(props, state) => <button {...props} disabled={state.disabled} />} />;
<MenuTrigger render={(props, state) => <button {...props} data-open={state.open} />} />;
<Badge variant="secondary">Ready</Badge>;
<Field orientation="vertical">
  <FieldLabel htmlFor="name">Name</FieldLabel>
  <Input id="name" />
  <FieldDescription>Shown in the panel.</FieldDescription>
</Field>;
<Switch checked onCheckedChange={(checked) => void checked} />;
<Select value="one" onValueChange={(value) => void value}>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectGroup><SelectItem value="one">One</SelectItem></SelectGroup>
  </SelectContent>
</Select>;
<SettingsSelectRow
  label="Mode"
  value="one"
  options={[{ value: "one", label: "One" }]}
  onChange={(value) => void value}
/>;

// @ts-expect-error Base UI composes triggers through `render`, not Radix's `asChild`.
<DialogTrigger asChild />;
// @ts-expect-error Base UI composes triggers through `render`, not Radix's `asChild`.
<DialogClose asChild />;
// @ts-expect-error Base UI composes triggers through `render`, not Radix's `asChild`.
<MenuTrigger asChild />;
