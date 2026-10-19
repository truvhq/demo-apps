import { render } from 'preact';
import '../components/styles.css';
import '../components/checkr-theme.css';

// Demos that have moved to the Checkr look load the preview with ?theme=checkr.
if (new URLSearchParams(window.location.search).get('theme') === 'checkr') {
  document.documentElement.classList.add('ck-theme');
}
import { PreviewRoot } from './PreviewRoot.jsx';

render(<PreviewRoot />, document.getElementById('preview-root'));
