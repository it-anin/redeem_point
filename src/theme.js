// Cream + Light Brown theme tokens
export const theme = {
  bg: '#FFFBF2',
  surface: '#FFFFFF',
  primary: '#F0D9B5',       // cream bright — buttons, active
  primaryDark: '#8C6A3A',   // dark brown — text on cream buttons
  secondary: '#C8935A',
  border: '#D4B896',        // light brown border
  text: '#2E1F0E',
  textMuted: '#8C6A4A',
  success: '#3DCB83',
  danger: '#E05252',
  radius: '24px',
  radiusSm: '14px',
}

// Inline style helpers
export const card = {
  background: theme.surface,
  borderRadius: theme.radius,
  border: `2px solid ${theme.border}`,
  padding: '20px',
}

export const btnPrimary = {
  background: theme.primary,
  color: theme.primaryDark,
  border: `1.5px solid ${theme.border}`,
  borderRadius: theme.radiusSm,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'Nunito, sans-serif',
}

export const pill = {
  background: theme.primary,
  color: theme.primaryDark,
  border: `1px solid ${theme.border}`,
  borderRadius: '20px',
  fontWeight: 700,
  fontSize: '12px',
  padding: '4px 12px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
}
