import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccessControlSection } from './AccessControlSection.jsx';
import { AccessUserList } from './AccessUserList.jsx';

/***
 * MARK: access settings component tests
 * @description Locks the Access tab: settings load and save (secret stays
 *   blank unless changed), group-mapping edits, the user table with direct
 *   and project roles, and the admin-only notes for non-managers.
 ***/

const settingsView = {
  knownRoles: ['admin', 'member', 'viewer'],
  enabled: false,
  issuerUrl: '',
  clientId: '',
  hasClientSecret: false,
  redirectUri: '',
  effectiveRedirectUri: 'http://localhost:3100/api/auth/callback',
  scopes: 'openid profile email groups',
  groupsClaim: 'groups',
  adminGroup: '',
  bootstrapAdmins: [],
  sessionTtlMs: 43200000,
  sessionIdleMs: 1800000,
  cookieName: 'kb_session',
  roleManagerRoles: ['admin'],
  groupRoleMappings: {},
};

const mocks = vi.hoisted(() => ({
  getAuthSettings: vi.fn(),
  saveAuthSettings: vi.fn(),
  getGroupMappings: vi.fn(),
  setGroupMappings: vi.fn(),
  listUsers: vi.fn(),
  setUserRoles: vi.fn(),
  setUserProjectRoles: vi.fn(),
  setUserDisabled: vi.fn(),
}));

vi.mock('../../services/auth/index.js', () => mocks);

afterEach(() => {
  vi.clearAllMocks();
});

describe('AccessControlSection', () => {
  it('loads settings, saves the form, and keeps the secret blank unless changed', async () => {
    mocks.getAuthSettings.mockResolvedValue(settingsView);
    mocks.getGroupMappings.mockResolvedValue({ mappings: {} });
    mocks.saveAuthSettings.mockImplementation((partial) =>
      Promise.resolve({ ...settingsView, ...partial }),
    );
    render(<AccessControlSection />);
    expect(await screen.findByTestId('access-control-section')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('OIDC issuer URL'), {
      target: { value: 'https://idp.example.com' },
    });
    fireEvent.click(screen.getByLabelText('Enable access control'));
    fireEvent.click(screen.getByRole('button', { name: /save access settings/i }));

    await waitFor(() => {
      expect(mocks.saveAuthSettings).toHaveBeenCalledTimes(1);
    });
    const partial = mocks.saveAuthSettings.mock.calls[0][0];
    expect(partial).toMatchObject({
      authEnabled: true,
      authIssuerUrl: 'https://idp.example.com',
    });
    expect(partial.authClientSecret).toBeUndefined();
    expect(await screen.findByText('Access settings saved.')).toBeInTheDocument();
  });

  it('adds a group mapping and saves it', async () => {
    mocks.getAuthSettings.mockResolvedValue(settingsView);
    mocks.getGroupMappings.mockResolvedValue({ mappings: {} });
    mocks.setGroupMappings.mockImplementation((mappings) =>
      Promise.resolve({ mappings }),
    );
    render(<AccessControlSection />);
    expect(await screen.findByTestId('access-control-section')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('New IdP group name'), {
      target: { value: 'team' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add group/i }));
    fireEvent.click(screen.getByLabelText('team grants member'));
    fireEvent.click(screen.getByRole('button', { name: /save group mappings/i }));

    await waitFor(() => {
      expect(mocks.setGroupMappings).toHaveBeenCalledWith({ team: ['member'] });
    });
  });

  it('explains itself to non-managers', async () => {
    mocks.getAuthSettings.mockRejectedValue(Object.assign(new Error('no'), { status: 403 }));
    mocks.getGroupMappings.mockRejectedValue(Object.assign(new Error('no'), { status: 403 }));
    render(<AccessControlSection />);
    expect(await screen.findByTestId('access-denied')).toHaveTextContent('admin role');
  });
});

describe('AccessUserList', () => {
  const ada = {
    id: 'ada-1',
    name: 'Ada',
    email: 'ada@example.com',
    directRoles: [],
    projectRoles: {},
    disabled: false,
  };

  it('toggles direct roles and sets project roles', async () => {
    mocks.listUsers.mockResolvedValue({ users: [ada] });
    mocks.getAuthSettings.mockResolvedValue(settingsView);
    mocks.setUserRoles.mockImplementation((id, roles) =>
      Promise.resolve({ user: { ...ada, directRoles: roles } }),
    );
    mocks.setUserProjectRoles.mockImplementation((id, projectId, roles) =>
      Promise.resolve({
        user: { ...ada, directRoles: ['member'], projectRoles: { [projectId]: roles } },
      }),
    );
    render(<AccessUserList />);
    expect(await screen.findByTestId('access-user-ada-1')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('ada-1 direct role member'));
    await waitFor(() => {
      expect(mocks.setUserRoles).toHaveBeenCalledWith('ada-1', ['member']);
    });

    fireEvent.change(screen.getByLabelText('Project id for ada-1'), {
      target: { value: 'alpha' },
    });
    fireEvent.change(screen.getByLabelText('Role for ada-1 in project'), {
      target: { value: 'viewer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /set project role/i }));
    await waitFor(() => {
      expect(mocks.setUserProjectRoles).toHaveBeenCalledWith('ada-1', 'alpha', ['viewer']);
    });
  });

  it('disables and re-enables accounts', async () => {
    mocks.listUsers.mockResolvedValue({ users: [ada] });
    mocks.getAuthSettings.mockResolvedValue(settingsView);
    mocks.setUserDisabled.mockImplementation((id, disabled) =>
      Promise.resolve({ user: { ...ada, disabled } }),
    );
    render(<AccessUserList />);
    expect(await screen.findByTestId('access-user-ada-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    await waitFor(() => {
      expect(mocks.setUserDisabled).toHaveBeenCalledWith('ada-1', true);
    });
    expect(await screen.findByText('Disabled')).toBeInTheDocument();
  });
});
