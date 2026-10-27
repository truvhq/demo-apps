/**
 * FILE SUMMARY: Coverage Analysis page - the two coverage tools as cards, in the
 * same Checkr look as the Public Sector page (DemoHub). Route: #coverage-analysis
 */
import { Header } from '../components/Header.jsx';
import { PhosphorIcons as Icons } from '../components/PhosphorIcons.jsx';
import { Section, Tile, TOOLS } from './DemoHub.jsx';
import './ps-hub.css';

export function CoverageHub({ industry }) {
  return (
    <div class="psh">
      <Header trail={[{ label: industry.name, href: `#${industry.id}` }]} sticky theme="checkr" />
      <section class="psh-hero">
        <div class="psh-wrap">
          <a href="#" class="psh-back"><Icons.arrowLeft size={14} /> Home</a>
          <h1 class="psh-title">{industry.name}</h1>
          <p class="psh-lead">{industry.desc}</p>
        </div>
      </section>
      <main class="psh-wrap psh-sections">
        <Section id="tools" title="Tools" sub="Check coverage with your own data.">
          {TOOLS.map((t, i) => <Tile key={t.id} href={t.href} name={t.name} desc={t.desc} Icon={Icons[t.icon]} index={i} />)}
        </Section>
      </main>
    </div>
  );
}
