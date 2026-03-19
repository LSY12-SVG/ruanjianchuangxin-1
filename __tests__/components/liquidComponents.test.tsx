import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {LiquidCard} from '../../src/components/design/LiquidCard';
import {LiquidFloatingBar} from '../../src/components/design/LiquidFloatingBar';
import {LiquidPanel} from '../../src/components/design/LiquidPanel';
import {LiquidSuggestionTile} from '../../src/components/design/LiquidSuggestionTile';

describe('liquid glass design wrappers', () => {
  it('renders LiquidCard in enabled mode', async () => {
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(
        <LiquidCard title="Test" subtitle="enabled" enabled>
          <></>
        </LiquidCard>,
      );
    });
  });

  it('renders LiquidCard fallback mode', async () => {
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(
        <LiquidCard title="Fallback" subtitle="off" enabled={false}>
          <></>
        </LiquidCard>,
      );
    });
  });

  it('renders LiquidPanel and LiquidFloatingBar', async () => {
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(
        <>
          <LiquidPanel enabled>
            <></>
          </LiquidPanel>
          <LiquidFloatingBar enabled>
            <></>
          </LiquidFloatingBar>
        </>,
      );
    });
  });

  it('renders LiquidSuggestionTile in fallback mode', async () => {
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(
        <LiquidSuggestionTile
          title="suggestion"
          subtitle="subtitle"
          enabled={false}
        />,
      );
    });
  });
});
