<script lang="ts">
  import { untrack } from "svelte";

  import { Button, Card, Field, FormActions, Input, Section, Stack } from "@a-novel-kit/uikit";
  import type { Host } from "@a-novel/plugins-narrative-engine-kit";

  type Beat = { id: string; title: string };

  let { host: hostProp }: { host: Host } = $props();
  // The host is the same for the life of a mount.
  const host = untrack(() => hostProp);
  const messages = host.messages as (typeof import("../i18n/en.json"))["messages"];

  let beats = $state.raw<Beat[]>([]);

  void host.content.get().then((content) => (beats = (content as { beats: Beat[] }).beats));

  async function add(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;
    const title = new FormData(form).get("title") as string;
    const next = [...beats, { id: crypto.randomUUID(), title }];
    await host.content.set({ beats: next });
    beats = next;
    // A reset also forgets that the field was used, so the emptied field does not read as invalid.
    form.reset();
  }
</script>

<!-- The canvas of the host holds the plugin, which titles its own section and builds its own card. -->
<Section title={messages.heading}>
  <Card>
    <Stack gap="8">
      {#if beats.length > 0}
        <ol>
          {#each beats as beat (beat.id)}
            <li>{beat.title}</li>
          {/each}
        </ol>
      {/if}
      <form onsubmit={add}>
        <Field label={messages.title} required>
          {#snippet children(control)}
            <Input {...control} name="title" />
          {/snippet}
        </Field>
        <FormActions>
          <Button type="submit">{messages.add}</Button>
        </FormActions>
      </form>
    </Stack>
  </Card>
</Section>

<style>
  /* The beats are siblings, and so are the field and the actions under it. */
  ol,
  form {
    display: grid;
    gap: var(--space-4);
  }

  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
