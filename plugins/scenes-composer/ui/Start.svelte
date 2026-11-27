<!--
@component
What a composer shows before it holds a beat: the structures a story can start from.
-->
<script lang="ts">
  import { type Messages, PRESETS, type Preset } from "./presets.ts";

  import { Card, EmptyState } from "@a-novel-kit/uikit";

  interface Props {
    messages: Messages;
    /** Receives the structure the writer chose. */
    onstart: (name: Preset) => void;
  }

  let { messages, onstart }: Props = $props();
</script>

<EmptyState title={messages.start.title} description={messages.start.description}>
  {#snippet actions()}
    <ul>
      {#each PRESETS as name (name)}
        <li>
          <Card surface="ghost">
            <h3><button type="button" onclick={() => onstart(name)}>{messages.presets[name].name}</button></h3>
            <p>{messages.presets[name].description}</p>
          </Card>
        </li>
      {/each}
    </ul>
  {/snippet}
</EmptyState>

<style>
  /* The structures are a collection: cards side by side, each as wide as a short description reads. */
  ul {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--layout-floating-md)), 1fr));
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    inline-size: 100%;
    max-inline-size: var(--layout-container-md);
    list-style: none;
    text-align: start;
  }

  li {
    display: grid;
    position: relative;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    font: var(--text-title-sm);
  }

  p {
    margin-block-start: var(--space-2);
    color: var(--color-text-secondary);
    font: var(--text-body-sm);
  }

  button {
    cursor: pointer;
    border: 0;
    background: none;
    padding: 0;
    color: inherit;
    font: inherit;
    text-align: start;
  }

  /* The whole card starts the structure it names. */
  button::after {
    position: absolute;
    inset: 0;
    content: "";
  }

  button:focus-visible {
    outline: none;
  }

  button:focus-visible::after {
    outline: var(--focus-ring-width) solid var(--color-focus-ring);
    outline-offset: var(--focus-ring-offset);
    border-radius: var(--radius-xl);
  }
</style>
