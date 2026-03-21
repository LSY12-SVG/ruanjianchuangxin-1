import React from 'react';
import {StatusBar} from 'react-native';
import {AppShell} from './src/components/app/AppShell';
import {RootProviders} from './src/providers/RootProviders';

function App() {
  return (
    <RootProviders>
      <StatusBar barStyle="light-content" backgroundColor="#060C1E" />
      <AppShell />
    </RootProviders>
  );
}

export default App;
