import { useEffect, useRef } from 'preact/hooks';
import mermaid from 'mermaid';

// Reset on HMR so config changes take effect during development
let initialized = false;
if (import.meta.hot) import.meta.hot.accept(() => { initialized = false; });

export function MermaidDiagram({ definition, id }) {
  const ref = useRef();

  useEffect(() => {
    if (!initialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          primaryColor: '#eef2ff',
          primaryTextColor: '#171717',
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
          actorTextColor: '#1e3a5f',
          signalColor: '#334155',
          signalTextColor: '#334155',
        },
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
          padding: 16,
          nodeSpacing: 40,
          rankSpacing: 50,
        },
      });
      initialized = true;
    }

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

  return <div ref={ref} class="flex justify-center" />;
}
