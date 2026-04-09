import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import LoginScreen from './LoginScreen';

vi.mock('../api.js', () => ({
  login: vi.fn().mockResolvedValue({ access_token: 'fake_token' }),
}));
vi.mock('../auth.js', () => ({ setAccessToken: vi.fn() }));

test('muestra campos de email y password', () => {
  render(<LoginScreen onSuccess={() => {}} onRegister={() => {}} onForgotPassword={() => {}} />);
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
});

test('botón de entrar está presente', () => {
  render(<LoginScreen onSuccess={() => {}} onRegister={() => {}} onForgotPassword={() => {}} />);
  expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
});
