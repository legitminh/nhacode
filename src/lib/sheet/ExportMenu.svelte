<script lang="ts">
  import { Button, NumberBox, SubKeyframe } from '@legitminh/keyflow';
  import { readPref, writePref } from '../preferences';
  import { A4, DEFAULT_PDF_SETTINGS, PDF_MARGIN_MAX, PDF_MARGIN_MIN, PDF_SCALE_MAX, PDF_SCALE_MIN, PDF_SIDES, clampPdfMargin,
    isPdfSettings, type PdfSettings, type PdfSide } from './pdf-layout';
  import { exportPdf, previewPdf } from './pdf-export';

  let { disabled = false }: { disabled?: boolean } = $props();

  let settings = $state<PdfSettings>(readPref('sheet:pdf', DEFAULT_PDF_SETTINGS, isPdfSettings));
  let busy = $state(false);
  let error = $state('');

  function save(next: PdfSettings) {
    settings = next;
    writePref('sheet:pdf', next);
  }
  const setScale = (value: number | null) => save({ ...settings, scale: value });
  const setMargin = (side: PdfSide) => (value: number) => save({ ...settings, margins: { ...settings.margins, [side]: clampPdfMargin(value) } });
  const percent = (scale: number) => Math.round(scale * 1000) / 10;

  async function run() {
    busy = true;
    error = '';
    try { await exportPdf(settings); } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not export the sheet.'; }
    finally { busy = false; }
  }
</script>

<!-- "export" panel (E): PDF on A4 at the sheet's current text size and line width; scaling and margins. -->
<SubKeyframe label="export" enterTrigger="e" {disabled} class="toolbar-menu export-menu">
  {#snippet children()}
    {@const preview = previewPdf(settings)}
    <div class="export-settings">
      <div class="export-row" data-field="format"><span>Format</span><span class="export-value">PDF</span></div>
      <div class="export-row" data-field="paper"><span>Paper</span><span class="export-value">A4 {A4.width}×{A4.height} mm</span></div>
      <div class="export-row" data-field="scale">
        <span>Scaling %</span>
        <NumberBox label="Scaling" value={settings.scale ?? percent(preview?.scale ?? 1)} min={PDF_SCALE_MIN} max={PDF_SCALE_MAX} step={0.1} digits={1}
          onchange={(value) => setScale(value)} class="export-field" />
      </div>
      <Button on_close={() => setScale(null)}>{settings.scale === null ? '✓ ' : ''}Auto scaling</Button>
      <span class="export-heading">Margins (mm)</span>
      {#each PDF_SIDES as side}
        <div class="export-row" data-field={`margin-${side}`}>
          <span>{side[0].toUpperCase() + side.slice(1)}</span>
          <NumberBox label={`${side} margin`} value={settings.margins[side]} min={PDF_MARGIN_MIN} max={PDF_MARGIN_MAX} step={0.1} digits={1}
            onchange={setMargin(side)} class="export-field" />
        </div>
      {/each}
      {#if preview}
        <p class="export-summary" role="status" data-pages={preview.pages.length} data-scale={percent(preview.scale)}>
          {preview.pages.length} {preview.pages.length === 1 ? 'page' : 'pages'} at {percent(preview.scale)}%{#if preview.reduced}, lowered so every line fits on a page{/if}
        </p>
      {/if}
      <Button on_close={run} disabled={busy || !preview?.pages.length}>{busy ? 'Exporting…' : 'Export PDF'}</Button>
      {#if error}<p class="range-error" role="alert">{error}</p>{/if}
    </div>
  {/snippet}
</SubKeyframe>
