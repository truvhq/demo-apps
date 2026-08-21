import React from 'react';
import { Route, Routes } from 'react-router-dom';

import { LoanFileDetailScreen } from './screens/LoanFileDetailScreen.jsx';
import { LoanFileListScreen } from './screens/LoanFileListScreen.jsx';
import { SettingsScreen } from './screens/SettingsScreen.jsx';
import { VerificationScreen } from './screens/verification/VerificationScreen.jsx';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LoanFileListScreen />} />
      <Route path="/loan-files/:id" element={<LoanFileDetailScreen />} />
      {/* Reachable from the nav with no target, or per-loan-file via :id. */}
      <Route path="/configure-truv" element={<VerificationScreen />} />
      <Route path="/loan-files/:id/verify" element={<VerificationScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
    </Routes>
  );
}
