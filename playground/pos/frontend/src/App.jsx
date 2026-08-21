import React from 'react';
import { Route, Routes } from 'react-router-dom';

import { ApplicationListScreen } from './screens/ApplicationListScreen.jsx';
import { BorrowerVerifyScreen } from './screens/verification/BorrowerVerifyScreen.jsx';
import { VerificationScreen } from './screens/verification/VerificationScreen.jsx';
import { ApplicationWizard } from './screens/wizard/index.jsx';
import { SettingsScreen } from './screens/SettingsScreen.jsx';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<ApplicationListScreen />} />
      <Route path="/applications/:id" element={<ApplicationWizard />} />
      {/* Developer console — every integration method/param, for testing/configuring Truv.
          Reachable from the nav with no target, or per-application via :id. */}
      <Route path="/configure-truv" element={<VerificationScreen />} />
      <Route path="/applications/:id/verify" element={<VerificationScreen />} />
      {/* What the borrower actually sees — no config, just Embedded Orders. */}
      <Route path="/applications/:id/verify-now" element={<BorrowerVerifyScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
    </Routes>
  );
}
