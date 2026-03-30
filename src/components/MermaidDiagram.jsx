import { useEffect, useRef } from 'preact/hooks';
import mermaid from 'mermaid';

let initialized = false;

export function MermaidDiagram({ definition, id }) {
  const ref = useRef();

  useEffect(() => {
    if (!initialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          primaryColor: '#f5f5f7',
          primaryTextColor: '#1d1d1f',
          primaryBorderColor: '#d2d2d7',
          lineColor: '#d2d2d7',
          secondaryColor: '#f5f5f7',
          tertiaryColor: '#ffffff',
          fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, Helvetica Neue, sans-serif',
          fontSize: '13px',
          nodeBorder: '#d2d2d7',
          mainBkg: '#f5f5f7',
          clusterBkg: '#ffffff',
          edgeLabelBackground: '#ffffff',
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
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
          ref.current.appendChild(svgEl);
        }
      }).catch(err => {
        console.error('Mermaid render error:', err);
      });
    }
  }, [definition]);

  return <div ref={ref} class="flex justify-center" />;
}
