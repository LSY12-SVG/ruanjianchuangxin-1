import React from 'react';
import {StatusBar} from 'react-native';
import {AuthGate} from './src/components/auth/AuthGate';
import {RootProviders} from './src/providers/RootProviders';

function App() {
  return (
    <RootProviders>
      <StatusBar barStyle="light-content" backgroundColor="#060C1E" />
      <AuthGate />
    </RootProviders>
  );
}

export default App;
