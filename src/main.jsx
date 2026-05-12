import { render } from 'preact';
import './components/styles.css';
import { App } from './App.jsx';
import { DeviceFramePresenceProvider } from './hooks/deviceFramePresence.jsx';

render(
  <DeviceFramePresenceProvider>
    <App />
  </DeviceFramePresenceProvider>,
  document.getElementById('app'),
);
