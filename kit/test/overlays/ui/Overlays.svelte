<!-- What a plugin opens above its own content, to check each one from inside a shadow root. -->
<script lang="ts">
  import {
    ActionMenu,
    Button,
    Card,
    Combobox,
    Dialog,
    Field,
    Input,
    Select,
    Stack,
    Tooltip,
    createComboboxController,
    createOpenController,
    createSelectController,
  } from "@a-novel-kit/uikit";

  const kinds = ["Setup", "Conflict", "Payoff"].map((label) => ({ value: label.toLowerCase(), label }));
  const actions = ["Rename", "Remove"].map((label) => ({ id: label.toLowerCase(), label }));

  const kind = createSelectController<string>();
  const place = createComboboxController<string>();
  const menu = createOpenController();
  const tooltip = createOpenController();
  const dialog = createOpenController();
</script>

<Card>
  <Stack>
    <Field label="Title">
      {#snippet children(control)}
        <Input {...control} />
      {/snippet}
    </Field>
    <Field label="Kind">
      {#snippet children(control)}
        <Select {...control} options={kinds} controller={kind} />
      {/snippet}
    </Field>
    <Field label="Place">
      {#snippet children(control)}
        <Combobox {...control} options={kinds} controller={place} />
      {/snippet}
    </Field>
    <ActionMenu label="Beat actions" items={actions} controller={menu} />
    <Tooltip content="Explains the beat" controller={tooltip}>
      {#snippet trigger(attributes)}
        <Button variant="outline" {...attributes}>Help</Button>
      {/snippet}
    </Tooltip>
    <Button onclick={dialog.open}>Open the dialog</Button>
  </Stack>
</Card>

<Dialog controller={dialog} title="Remove the beat?">
  {#snippet actions()}
    <Button onclick={dialog.close}>Keep it</Button>
  {/snippet}
</Dialog>
