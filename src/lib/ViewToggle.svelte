<script lang="ts">
  import { StaticButton } from '@legitminh/keyflow';
  import type { Snippet } from 'svelte';

  let { label, shortcut, on, disabled = false, ontoggle, children }: {
    label: string;
    /** A fixed letter outside the piano's 0–b labels. */
    shortcut: string;
    on: boolean;
    disabled?: boolean;
    ontoggle: () => void;
    children: Snippet;
  } = $props();
</script>

<!-- A Keyflow toggle that shows and hides one screen. -->
<div class="view-toggle" class:on data-view={label.toLowerCase()} data-on={on} title={`${on ? 'Hide' : 'Show'} ${label.toLowerCase()} (${shortcut.toUpperCase()})`}>
  <StaticButton keys={shortcut} on_close={ontoggle} {disabled}>
    <span class="view-toggle-content"><span class="visually-hidden">{label}</span>{@render children()}</span>
  </StaticButton>
</div>
