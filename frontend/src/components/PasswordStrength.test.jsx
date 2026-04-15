import { render, screen } from '@testing-library/react';
import PasswordStrength from './PasswordStrength';

test('no muestra nada con password vacío', () => {
  const { container } = render(<PasswordStrength password="" />);
  expect(container).toBeEmptyDOMElement();
});

test('muestra reglas cuando hay password', () => {
  render(<PasswordStrength password="ab" />);
  expect(screen.getByText('Mínimo 8 caracteres')).toBeInTheDocument();
});

test('marca regla como cumplida', () => {
  render(<PasswordStrength password="Password1" />);
  // Las tres reglas están presentes
  expect(screen.getAllByText('✓')).toHaveLength(3);
});
