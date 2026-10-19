/**
 * FILE SUMMARY: Renders Mermaid diagrams for architecture visualization
 * DATA FLOW: Presentational: no direct backend communication
 *
 * Accepts a Mermaid definition string and renders it as inline SVG with Truv
 * brand colors. Re-renders automatically when the definition prop changes.
 * Used by IntroSlide to show architecture sequence diagrams.
 */

// Imports
import { useEffect, useRef } from 'preact/hooks';
import mermaid from 'mermaid';

// Module-level state: reset on HMR so config changes take effect during development
let initialized = false;   // false, or the theme Mermaid was last set up for

// Original Truv diagram colors.
const BASE_VARS = {
  primaryColor: '#eef2ff',
  primaryTextColor: '#000000',
  primaryBorderColor: '#2C64E3',
  lineColor: '#94a3b8',
  secondaryColor: '#f0f2f5',
  tertiaryColor: '#ffffff',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  fontSize: '13px',
  nodeBorder: '#2C64E3',
  mainBkg: '#eef2ff',
  clusterBkg: '#ffffff',
  edgeLabelBackground: '#ffffff',
  noteBkgColor: '#fef3c7',
  noteBorderColor: '#f59e0b',
  noteTextColor: '#92400e',
  actorBkg: '#eef2ff',
  actorBorder: '#2C64E3',
  actorTextColor: '#000000',
  signalColor: '#334155',
  signalTextColor: '#808080',
};

// Checkr look: the same greys, black and status green as checkr-theme.css.
const CHECKR_VARS = {
  primaryColor: '#f8f8f8', primaryTextColor: '#1b1c1f', primaryBorderColor: '#1b1c1f',
  lineColor: '#7a828c', secondaryColor: '#f0f2f5',
  fontFamily: '"National 2", Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  nodeBorder: '#1b1c1f', mainBkg: '#f8f8f8',
  noteBkgColor: '#f0f2f5', noteBorderColor: '#d8dee5', noteTextColor: '#1b1c1f',
  actorBkg: '#f8f8f8', actorBorder: '#1b1c1f', actorTextColor: '#1b1c1f',
  signalColor: '#474c52', signalTextColor: '#474c52',
};
if (import.meta.hot) import.meta.hot.accept(() => { initialized = false; });

// Component: MermaidDiagram
// Props:
//   definition : Mermaid diagram definition string
//   id         : optional unique ID for the rendered diagram element
export function MermaidDiagram({ definition, id }) {
  // Ref for the container DOM element that will hold the rendered SVG
  const ref = useRef();

  // Effect: initialize Mermaid once, then render/re-render on definition changes
  useEffect(() => {
    // Initialize Mermaid for the theme this diagram sits in. Mermaid's config
    // is global, so re-initialize only when the theme changes (e.g. moving
    // from a Checkr-themed demo to one still in the original style).
    const theme = ref.current?.closest('.ck-theme') ? 'checkr' : 'truv';
    if (initialized !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: { ...BASE_VARS, ...(theme === 'checkr' ? CHECKR_VARS : {}) },
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
          padding: 16,
          nodeSpacing: 40,
          rankSpacing: 50,
        },
      });
      initialized = theme;
    }

    // Render the diagram into the container ref
    if (ref.current && definition) {
      const diagId = id || `mermaid-${Math.random().toString(36).slice(2, 8)}`;
      // Mermaid.render returns trusted SVG from hardcoded diagram definitions (not user input)
      mermaid.render(diagId, definition).then(({ svg }) => {
        ref.current.replaceChildren();
        const wrapper = document.createElement('div');
        wrapper.innerHTML = svg; // Safe: mermaid generates SVG from developer-defined diagram strings
        const svgEl = wrapper.querySelector('svg');
        if (svgEl) {
          svgEl.style.width = '100%';
          svgEl.style.height = 'auto';
          svgEl.removeAttribute('height');
          ref.current.appendChild(svgEl);
        }
      }).catch(err => {
        console.error('Mermaid render error:', err);
      });
    }
  }, [definition]);

  // Rendering: empty container div that gets populated by Mermaid
  return <div ref={ref} class="flex justify-center" />;
}
