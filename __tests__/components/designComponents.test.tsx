import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {AIStatusBadge} from '../../src/components/design/AIStatusBadge';
import {GlassCard} from '../../src/components/design/GlassCard';
import {TagPill} from '../../src/components/design/TagPill';

describe('design components', () => {
  it('renders AIStatusBadge in compact icon-first mode', async () => {
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<AIStatusBadge tone="active" icon="sparkles-outline" compact />);
    });
  });

  it('renders TagPill in icon-only mode', async () => {
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<TagPill icon="flash-outline" showLabel={false} active />);
    });
  });

  it('renders GlassCard with hidden subtitle and accent', async () => {
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(
        <GlassCard title="Card" subtitle="Hidden" subtitleMode="hidden" accent="hero">
          <></>
        </GlassCard>,
      );
    });
  });
});
