<script lang="ts">
  import './layout.css';
  import '$lib/fonts.css';
  import * as Tooltip from '$lib/components/ui/tooltip/index.js';
  let { children } = $props();
</script>

<Tooltip.Provider>{@render children()}</Tooltip.Provider>
