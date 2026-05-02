import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockNavigate, mockSignIn, mockSignUp } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSignIn: vi.fn(),
  mockSignUp: vi.fn(),
}));

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('~/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignIn,
      signUp: mockSignUp,
      resend: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

import Login from './login';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Login page', () => {
  it('renders the Sign In tab by default', () => {
    render(<Login />);
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('switches to Sign Up tab when clicked', async () => {
    render(<Login />);
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    expect(screen.getByRole('heading', { name: /create an account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('renders email and password fields', () => {
    render(<Login />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('shows error message for invalid credentials on sign in', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<Login />);

    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  it('shows verify email prompt after successful sign up', async () => {
    mockSignUp.mockResolvedValue({ error: null });
    render(<Login />);

    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    await userEvent.type(screen.getByLabelText(/email/i), 'new@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
      expect(screen.getByText(/new@example.com/)).toBeInTheDocument();
    });
  });

  it('shows error when email is not confirmed on sign in', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Email not confirmed' } });
    render(<Login />);

    await userEvent.type(screen.getByLabelText(/email/i), 'unverified@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    });
  });

  it('navigates to home on successful sign in', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    render(<Login />);

    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('clears error when switching tabs', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<Login />);

    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'badpassword');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    expect(screen.queryByText(/invalid email or password/i)).not.toBeInTheDocument();
  });
});
