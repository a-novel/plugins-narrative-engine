<!--
@component
Tells what describes a beat or a scene in a bubble, under the pointer or with the focus, while its
description is out of view. The header it describes is the trigger.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  import { Tooltip, type TooltipTriggerAttributes, createOpenController } from "@a-novel-kit/uikit";

  interface Props {
    description: string;
    /** Whether the description itself is out of view. In view, the bubble would say it twice. */
    hidden: boolean;
    /** Renders the header, with every attribute spread onto it. */
    trigger: Snippet<[TooltipTriggerAttributes]>;
  }

  let { description, hidden, trigger }: Props = $props();

  const bubble = createOpenController();
</script>

<Tooltip controller={bubble} side="bottom" disabled={!hidden || description === ""} {trigger}>
  {#snippet content()}
    <span class="description">{description}</span>
  {/snippet}
</Tooltip>

<style>
  /* The bubble keeps the lines a writer broke. */
  .description {
    white-space: pre-line;
  }
</style>
