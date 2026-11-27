<!--
@component
The Scenes Composer, as its host mounts it: the structures to start from while the composer holds
no beat, then its timeline.
-->
<script lang="ts">
  import Start from "./Start.svelte";
  import Timeline from "./Timeline.svelte";
  import { createComposer } from "./composer.svelte.ts";
  import type { Messages } from "./presets.ts";

  import { tick, untrack } from "svelte";

  import { createStaticI18n } from "@a-novel-kit/nodelib-i18n";
  import { setI18nContext } from "@a-novel-kit/nodelib-i18n/svelte";
  import { Alert, Button } from "@a-novel-kit/uikit";
  import type { Host } from "@a-novel/plugins-narrative-engine-kit";

  let { host: hostProp }: { host: Host } = $props();
  // The host is the same for the life of a mount.
  const host = untrack(() => hostProp);
  const messages = host.messages as Messages;

  // The text uikit's components bring, such as the names of the colors a field offers, follows the
  // language of the host. Outside this context it is English.
  setI18nContext(
    createStaticI18n({
      locale: host.locale,
      defaultLocale: "en",
      defaultNamespace: "uikit",
      namespaces: ["uikit"],
      resources: {},
    })
  );

  const composer = createComposer(host);

  let root = $state<HTMLElement>();

  // The button that takes a deletion back leaves with its message. The timeline takes the focus it
  // held, through the header or the card the Tab key reaches, so the keys go on from there.
  async function takeBack() {
    composer.undo();
    await tick();
    root?.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]')?.focus();
  }

  // Undo and redo act on the whole composer, whatever holds the focus inside it. A field keeps the
  // keys: the field of a card takes its own typing back first, and a dialog holds nothing saved yet.
  function onkeydown(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (!(event.ctrlKey || event.metaKey) || event.altKey || (key !== "z" && key !== "y")) return;
    if (event.defaultPrevented || (event.target as HTMLElement).closest("input, textarea, dialog")) return;

    event.preventDefault();
    if (key === "y" || event.shiftKey) composer.redo();
    else composer.undo();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions: the keys of undo and redo reach the composer from whatever holds the focus inside it. -->
<div bind:this={root} class="composer" {onkeydown}>
  {#if composer.unavailable}
    <Alert tone="error" title={messages.failures.load}>
      {#snippet actions()}
        <Button variant="outline" tone="neutral" size="sm" onclick={composer.load}>
          {messages.timeline.actions.retry}
        </Button>
      {/snippet}
    </Alert>
  {/if}

  {#if composer.unsaved}
    <Alert tone="error" title={messages.failures.save}>
      {#snippet actions()}
        <Button variant="outline" tone="neutral" size="sm" onclick={composer.save}>
          {messages.timeline.actions.retry}
        </Button>
      {/snippet}
    </Alert>
  {/if}

  {#if composer.deleted}
    <Alert tone="info" title={composer.deleted}>
      {#snippet actions()}
        <Button variant="outline" tone="neutral" size="sm" onclick={takeBack}>
          {messages.timeline.actions.undo}
        </Button>
      {/snippet}
    </Alert>
  {/if}

  {#if composer.content?.beats.length === 0}
    <Start {messages} onstart={composer.start} />
  {:else if composer.content}
    <Timeline {composer} content={composer.content} {messages} locale={host.locale} />
  {/if}
</div>

<style>
  /* The composer fills the box its host gives it, and scrolls inside when it outgrows it. A message
     and what follows are siblings, and the timeline takes the room the messages leave. */
  .composer {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    block-size: 100%;
    overflow: auto;
  }
</style>
