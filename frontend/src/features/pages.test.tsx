import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

describe('secondary pages are honest about their state', () => {
  it('integrations: nothing is shown as connected and connect is disabled', () => {
    renderApp('/integrations', 'en');
    expect(screen.getAllByText('Not connected')).toHaveLength(3);
    expect(screen.queryByText(/^Connected$/)).not.toBeInTheDocument();
    for (const b of screen.getAllByRole('button', { name: /Connect/ })) expect(b).toBeDisabled();
  });

  it('agents: catalog lists 6 agents, 2 MVP priority, activation disabled', () => {
    renderApp('/agents', 'en');
    expect(screen.getAllByRole('article')).toHaveLength(6);
    expect(screen.getAllByText('MVP priority')).toHaveLength(2);
    for (const b of screen.getAllByRole('button', { name: 'Activate' })) expect(b).toBeDisabled();
  });

  it('planned modules declare they are not operational', () => {
    renderApp('/finance', 'en');
    expect(screen.getByText(/not operational yet/)).toBeInTheDocument();
    expect(screen.getByText('Planned for Phase 4')).toBeInTheDocument();
  });

  it('settings: reduced-motion preference sets data-motion on <html>', async () => {
    const user = userEvent.setup();
    renderApp('/settings', 'en');
    await user.click(screen.getByRole('button', { name: 'Reduced' }));
    expect(document.documentElement.dataset.motion).toBe('reduced');
    await user.click(screen.getByRole('button', { name: 'Follow system' }));
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });
});
