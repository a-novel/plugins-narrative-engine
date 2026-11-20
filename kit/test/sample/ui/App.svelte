<script lang="ts">
  import { untrack } from "svelte";

  import { Button, Input } from "@a-novel-kit/uikit";
  import type { Host } from "@a-novel/plugins-narrative-engine-kit";

  type Beat = { id: string; title: string };

  let { host: hostProp }: { host: Host } = $props();
  // The host is the same for the life of a mount.
  const host = untrack(() => hostProp);
  const messages = host.messages as Record<string, string>;

  let beats = $state.raw<Beat[]>([]);
  let title = $state("");

  void host.content.get().then((content) => (beats = (content as { beats: Beat[] }).beats));

  async function add(event: SubmitEvent) {
    event.preventDefault();

    const next = [...beats, { id: crypto.randomUUID(), title }];
    await host.content.set({ beats: next });
    beats = next;
    title = "";
  }
</script>

<form onsubmit={add}>
  <h2>{messages.heading}</h2>
  <ol>
    {#each beats as beat (beat.id)}
      <li>{beat.title}</li>
    {/each}
  </ol>
  <Input aria-label={messages.title} required value={title} oninput={(event) => (title = event.currentTarget.value)} />
  <Button type="submit">{messages.add}</Button>
</form>

<style>
  form {
    display: grid;
    gap: var(--space-4);
    color: var(--color-text-primary);
    font-family: var(--font-family-interface);
  }
</style>
