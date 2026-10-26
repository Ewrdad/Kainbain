import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthOllamaWidget } from './HealthOllamaWidget';
import '@testing-library/jest-dom';

/***
 * MARK: HealthOllamaWidget tests
 * @description Proves the extracted Ollama Cloud card reads Online when
 *   healthy and never turns an absent optional service red.
 ***/

describe('HealthOllamaWidget', () => {
  it('renders Online when the bridge is healthy', () => {
    render(
      <HealthOllamaWidget
        healthState={{ checks: { ollamaCloud: { status: 'ok', message: 'Bridge ready' } } }}
      />,
    );

    const card = screen.getByTestId('health-ollama');
    expect(card).toHaveTextContent('Ollama Cloud');
    expect(card).toHaveTextContent('Online');
    expect(card).toHaveTextContent('Local Inference');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-emerald-400');
  });

  it('renders an unconfigured bridge as grey wording with a grey dot', () => {
    render(
      <HealthOllamaWidget healthState={{ checks: { ollamaCloud: { status: 'unconfigured' } } }} />,
    );

    const card = screen.getByTestId('health-ollama');
    expect(card).toHaveTextContent('Not configured');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-slate-500');
  });

  it('reads Standby with no payload and a neutral dot', () => {
    render(<HealthOllamaWidget />);

    const card = screen.getByTestId('health-ollama');
    expect(card).toHaveTextContent('Standby');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-slate-400');
  });
});
