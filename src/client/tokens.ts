// The spec §9 tokens AntD needs (ConfigProvider theme.token), per effective theme. Values are copied
// from src/styles/tokens.scss — keep both in sync. radius = button radius (9).
export interface AntdTokens {
  accent: string;
  bg: string;
  surface: string;
  text: string;
  border: string;
  radius: number;
}

export const TOKENS: Record<'light' | 'dark', AntdTokens> = {
  light: { accent: '#4f46e5', bg: '#f7f7f5', surface: '#ffffff', text: '#1c1b18', border: '#e3e1db', radius: 9 },
  dark: { accent: '#818cf8', bg: '#141413', surface: '#21211f', text: '#ecebe6', border: '#363531', radius: 9 },
};
