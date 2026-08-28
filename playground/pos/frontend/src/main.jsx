import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@truv-demo/design-system/src/styles/global.css';

import { App } from './App.jsx';

// No <React.StrictMode> here on purpose: its dev-only double-invoke of
// effects (mount -> effect -> cleanup -> mount -> effect again) tears down
// and never recreates the Truv Bridge iframe — confirmed via a live test
// (net::ERR_ABORTED on the widget's iframe request, empty container after).
// Truv's SDK isn't built to be reentrant like that; this is the same class
// of issue Stripe Elements/Plaid Link hit under StrictMode. Not worth fighting
// for a local dev tool with no production audience relying on StrictMode's checks.
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
