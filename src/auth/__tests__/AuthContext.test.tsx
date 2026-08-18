import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../AuthProvider';
import { UserBadge } from '../../components/layout/UserBadge';

let fetchMock: ReturnType<typeof vi.fn>;

function response(body: object): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AuthProvider', () => {
  it('shows the authenticated identity and logout control', async () => {
    fetchMock.mockResolvedValue(response({
      authenticated: true,
      email: 'user@example.com',
      user: 'Example User',
    }));

    render(
      <AuthProvider>
        <UserBadge />
      </AuthProvider>,
    );

    expect(await screen.findByText('user@example.com')).toBeTruthy();
    expect(screen.getByTitle('Sign out')).toBeTruthy();
  });

  it('stays visually absent when edge authentication is disabled', async () => {
    fetchMock.mockResolvedValue(response({ authenticated: false, email: null, user: null }));

    render(
      <AuthProvider>
        <UserBadge />
      </AuthProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/whoami', expect.anything()));
    expect(screen.queryByTitle('Sign out')).toBeNull();
  });

  it('starts login when the API reports an expired session', async () => {
    const navigate = vi.fn();
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);

    render(
      <AuthProvider navigate={navigate}>
        <UserBadge />
      </AuthProvider>,
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/oauth2\/start\?rd=/));
  });
});
