import { render } from 'preact';
import '../components/styles.css';
import '../components/checkr-theme.css';

// Every demo uses the Checkr look; ?theme=truv opts a preview out.
if (new URLSearchParams(window.location.search).get('theme') !== 'truv') {
  document.documentElement.classList.add('ck-theme');
}
import { PreviewRoot } from './PreviewRoot.jsx';

render(<PreviewRoot />, document.getElementById('preview-root'));
