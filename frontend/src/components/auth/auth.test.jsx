import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { LoginPage } from './LoginPage.jsx';
import { RequireAuth } from './RequireAuth.jsx';
import { AuthUserChip } from './AuthUserChip.jsx';

/***
 * MARK: auth component tests
 * @description Locks the sign-in page (button, provider-refusal notice),
 *   the route guard (pass-through while off, bounce while on), and the
 *   header chip (hidden while off, named while signed in).
 ***/

vi.mock('../../services/auth/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, startLogin: vi.fn() };
});

const { startLogin } = await import('../../services/auth/index.js');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(startLogin).mockClear();
});

const stubStatus = (status) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(status),
      text: () => Promise.resolve(JSON.stringify(status)),
    }),
  );
};

describe('LoginPage', () => {
  it('offers the organisation sign-in button', async () => {
    stubStatus({ authEnabled: true, user: null, roles: [] });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('button', { name: /sign in with your organisation account/i }),
    ).toBeInTheDocument();
  });

  it('explains a provider refusal from the query string', async () => {
    stubStatus({ authEnabled: true, user: null, roles: [] });
    render(
      <MemoryRouter initialEntries={['/login?error=access_denied&message=nope']}>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('login-error')).toHaveTextContent('access_denied');
  });
});

describe('RequireAuth', () => {
  it('renders children untouched while access control is off', async () => {
    stubStatus({ authEnabled: false, user: null, roles: ['admin'] });
    render(
      <MemoryRouter initialEntries={['/']}>
        <RequireAuth>
          <p>board content</p>
        </RequireAuth>
      </MemoryRouter>,
    );
    expect(await screen.findByText('board content')).toBeInTheDocument();
  });

  it('treats an unreachable API as access-control-off', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    render(
      <MemoryRouter initialEntries={['/']}>
        <RequireAuth>
          <p>board content</p>
        </RequireAuth>
      </MemoryRouter>,
    );
    expect(await screen.findByText('board content')).toBeInTheDocument();
  });

  it('bounces strangers to the login page while on', async () => {
    stubStatus({ authEnabled: true, user: null, roles: [] });
    render(
      <MemoryRouter initialEntries={['/']}>
        <RequireAuth>
          <Routes>
            <Route path="/" element={<p>board content</p>} />
            <Route path="/login" element={<p>login marker</p>} />
          </Routes>
        </RequireAuth>
      </MemoryRouter>,
    );
    expect(await screen.findByText('login marker')).toBeInTheDocument();
    expect(screen.queryByText('board content')).not.toBeInTheDocument();
  });

  it('keeps signed-in users on the board', async () => {
    stubStatus({ authEnabled: true, user: { id: 'u1', name: 'Ada' }, roles: ['member'] });
    render(
      <MemoryRouter initialEntries={['/']}>
        <RequireAuth>
          <p>board content</p>
        </RequireAuth>
      </MemoryRouter>,
    );
    expect(await screen.findByText('board content')).toBeInTheDocument();
  });
});

describe('AuthUserChip', () => {
  it('renders nothing while access control is off', async () => {
    stubStatus({ authEnabled: false, user: null, roles: ['admin'] });
    const { container } = render(<AuthUserChip />);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('names the signed-in user and offers sign out', async () => {
    stubStatus({ authEnabled: true, user: { id: 'u1', name: 'Ada' }, roles: ['member'] });
    render(<AuthUserChip />);
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});
