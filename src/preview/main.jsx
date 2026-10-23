import { render } from 'preact';
import '../components/styles.css';
import '../components/checkr-theme.css';
import { PreviewRoot } from './PreviewRoot.jsx';

// ?theme=checkr opts a preview into the Checkr look (Public Sector demos only).
if (new URLSearchParams(window.location.search).get('theme') === 'checkr') {
  document.documentElement.classList.add('ck-theme');
}

render(<PreviewRoot />, document.getElementById('preview-root'));
