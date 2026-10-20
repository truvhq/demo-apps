/**
 * FILE SUMMARY: demo.truv.com home - every demo from every industry on one
 * page as tiles (filterable by industry), plus Guides. Same layout as the
 * industry pages (DemoHub), so there are no click-through levels.
 */
import { useState } from 'preact/hooks';
import { INDUSTRIES } from './App.jsx';
import { OverrideKeyDialog } from './components/OverrideKeyDialog.jsx';
import { useSession } from './hooks/useSession.js';
import { DemoHub } from './industry/DemoHub.jsx';

export function Home() {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const { override } = useSession();
  const industries = INDUSTRIES.filter(i => i.demos.length > 0);
  // Every demo, labelled with its industry. Keys include the industry because
  // demo ids repeat across industries (e.g. "documents").
  const items = industries.flatMap(ind => ind.demos.map(d => ({
    key: `${ind.id}/${d.id}`, demo: d, industryId: ind.id, industryName: ind.name, label: ind.name,
  })));

  return (
    <>
      <OverrideKeyDialog open={overrideOpen} onClose={() => setOverrideOpen(false)} onSubmit={override} />
      <DemoHub
        trail={[]}
        eyebrow="Demo apps"
        title="See Truv verification in action"
        lead="Verify income, employment and assets across mortgage, public sector, consumer credit and retail banking, and check how many of your employers and banks Truv covers."
        items={items}
        filters={industries.map(i => ({ id: i.id, name: i.name }))}
        // Public Sector is the primary audience, so it is the default view.
        defaultFilter="public-sector"
        heroExtra={
          // Home-only action: swap the API keys in use without leaving the page.
          <button type="button" class="psh-btn-outline" onClick={() => setOverrideOpen(true)}>
            Update API keys
          </button>
        }
      />
    </>
  );
}
