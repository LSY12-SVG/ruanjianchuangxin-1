import React from 'react';
import {StatusBar, StyleSheet, Text, View} from 'react-native';

function App() {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0b1220" />
      <View style={styles.container}>
        <Text style={styles.title}>Frontend Reset</Text>
        <Text style={styles.subtitle}>前端界面已清空，等待按新后端接口重新搭建。</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  title: {
    color: '#eaf4ff',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9cb3c9',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default App;
