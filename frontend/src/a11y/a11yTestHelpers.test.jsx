import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  assertNamed,
  assertAllNamed,
  assertDialogLabelled,
  assertLiveRegion,
  assertHeadingOrder,
  assertSectionHeadings,
} from './a11yTestHelpers';

// The shared a11y assertions test themselves against sample markup so a
// helper bug can never silently green-light a view (Phase 1.1).

describe('assertNamed', () => {
  it('passes a button with text content', () => {
    render(<button type="button">Save configuration</button>);
    expect(assertNamed(screen.getByRole('button'))).toBe('Save configuration');
  });

  it('passes an icon-only button with an aria-label', () => {
    render(
      <button type="button" aria-label="Close prompt review">
        ✕
      </button>,
    );
    expect(assertNamed(screen.getByRole('button'))).toBe('Close prompt review');
  });

  it('fails an unnamed icon-only button with the WCAG criterion attached', () => {
    render(
      <button type="button">
        <span aria-hidden="true">✕</span>
      </button>,
    );
    expect(() => assertNamed(screen.getByRole('button'))).toThrow(/4\.1\.2/);
  });
});

describe('assertAllNamed', () => {
  it('passes a fully named toolbar and names every control', () => {
    render(
      <div>
        <button type="button">Approve</button>
        <label>
          Name
          <input type="text" />
        </label>
      </div>,
    );
    const names = assertAllNamed(document.body);
    expect(names).toContain('Approve');
  });

  it('fails when any control is unnamed', () => {
    render(
      <div>
        <button type="button">Approve</button>
        <button type="button" data-testid="ghost">
          <span aria-hidden="true">×</span>
        </button>
      </div>,
    );
    expect(() => assertAllNamed(document.body)).toThrow(/4\.1\.2/);
  });
});

describe('assertDialogLabelled', () => {
  it('passes a dialog whose title id resolves', () => {
    render(
      <div role="dialog" aria-labelledby="dlg-title">
        <h2 id="dlg-title">Review prompt</h2>
      </div>,
    );
    expect(assertDialogLabelled(screen.getByRole('dialog'))).toBe('dlg-title');
  });

  it('fails a dialog with no title reference', () => {
    render(<div role="dialog">content</div>);
    expect(() => assertDialogLabelled(screen.getByRole('dialog'))).toThrow(/4\.1\.2/);
  });
});

describe('assertLiveRegion', () => {
  it('finds status, alert, and log regions', () => {
    render(
      <div>
        <div role="status">saved</div>
      </div>,
    );
    expect(assertLiveRegion(document.body).getAttribute('role')).toBe('status');
  });

  it('fails silent containers with the status-message criterion attached', () => {
    render(<div>silent</div>);
    expect(() => assertLiveRegion(document.body)).toThrow(/4\.1\.3/);
  });
});

describe('assertSectionHeadings', () => {
  it('passes sections that each open with a heading', () => {
    render(
      <div>
        <section aria-label="one">
          <h2>First section</h2>
        </section>
        <div role="region" aria-label="two">
          <h3>Second region</h3>
        </div>
      </div>,
    );
    expect(assertSectionHeadings(document.body)).toEqual(['First section', 'Second region']);
  });

  it('fails a section with no heading, citing 2.4.10', () => {
    render(
      <section aria-label="silent">
        <p>No heading here</p>
      </section>,
    );
    expect(() => assertSectionHeadings(document.body)).toThrow(/2\.4\.10/);
  });
});

describe('assertHeadingOrder', () => {
  it('passes sequential headings', () => {
    render(
      <div>
        <h1>Title</h1>
        <h2>Section</h2>
        <h3>Sub</h3>
      </div>,
    );
    expect(assertHeadingOrder(document.body)).toEqual([1, 2, 3]);
  });

  it('fails a skipped level', () => {
    render(
      <div>
        <h1>Title</h1>
        <h3>Sub</h3>
      </div>,
    );
    expect(() => assertHeadingOrder(document.body)).toThrow(/1\.3\.1/);
  });
});
