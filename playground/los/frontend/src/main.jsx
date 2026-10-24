import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@truv-demo/design-system/src/styles/global.css';

import { App } from './App.jsx';
// No <React.StrictMode> here on purpose: its dev-only double-invoke of
// effects (mount -> effect -> cleanup -> mount -> effect again) tears down
// and never recreates the Truv Bridge iframe — confirmed the hard way in
// POS's copy of this widget; see BridgeEmbedScreen.jsx.
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
