import { useState, useEffect } from 'preact/hooks';
import { Home } from './Home';
import { ApplicationDemo } from './demos/Application';
import { FollowUpDemo } from './demos/FollowUp';
import { ConsumerCreditDemo } from './demos/ConsumerCredit';
import { EmployeePortalDemo } from './demos/EmployeePortal';
import { UploadDocumentsDemo } from './demos/UploadDocuments';
import type { ComponentType } from 'preact';

interface DemoProps {
  screen: string;
  param: string;
}

const DEMOS: Record<string, ComponentType<DemoProps>> = {
  'application': ApplicationDemo,
  'follow-up': FollowUpDemo,
  'consumer-credit': ConsumerCreditDemo,
  'verifier-portal': EmployeePortalDemo,
  'upload-documents': UploadDocumentsDemo,
};

interface Route {
  demo: string;
  screen: string;
  param: string;
}

function parseHash(): Route {
  const hash = window.location.hash.slice(1); // e.g. "follow-up/bridge/income"
  const [demo, screen, ...rest] = hash.split('/');
  return { demo: demo ?? '', screen: screen ?? '', param: rest.join('/') };
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!route.demo) return <Home />;

  const Component = DEMOS[route.demo];
  if (!Component) return <Home />;

  return <Component key={route.demo} screen={route.screen} param={route.param} />;
}
