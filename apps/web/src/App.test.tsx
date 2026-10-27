import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { App } from './App';

afterEach(cleanup);

it('renders the application heading and dashboard placeholder', () => {
  render(<App />);

  expect(screen.getByRole('heading', { level: 1, name: 'Endpoint Watch' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Your monitoring workspace' })).toBeTruthy();
  expect(screen.getByText('Endpoint status and recent check history will appear here.')).toBeTruthy();
});
