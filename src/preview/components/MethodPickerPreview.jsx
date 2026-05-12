/**
 * Renders the same MethodPicker that the host used to render directly. METHODS
 * is imported on the iframe side so methodId is the only thing crossing the
 * postMessage boundary (the host re-resolves the full method object by id).
 */

import { MethodPicker, METHODS } from '../../demos/scaffolding/smart-routing.jsx';
import { postEvent } from '../protocol.js';

export function MethodPickerPreview({ recommended, loading = false }) {
  return (
    <div>
      <h2 class="text-2xl font-bold tracking-tight mb-1.5">Choose verification method</h2>
      <p class="text-sm text-gray-500 leading-relaxed mb-7">
        Based on employer coverage, we recommend a method. You can pick any.
      </p>
      <MethodPicker
        methods={METHODS}
        recommended={recommended}
        loading={loading}
        onSelect={(m) => postEvent('method:select', [m.id])}
      />
      <button
        type="button"
        onClick={() => postEvent('nav:back', [])}
        class="mt-6 text-sm text-[#8E8E93] hover:text-primary"
      >
        &larr; Back to application
      </button>
    </div>
  );
}
