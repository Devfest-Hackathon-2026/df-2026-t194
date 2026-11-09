import { createContext, useContext, type ReactNode } from 'react';
import messages from './messages.json';
import { I18N, type AppLanguage } from '@/components/hud/hudTypes';
export const UiLanguage = createContext<AppLanguage>('ja');
export function translateUi(value: string, language: AppLanguage): string {
  if (language === 'ja') return value;
  const trimmed = value.trim();
  const entry = (messages as Record<string, {en: string; zh: string}>)[trimmed];
  if (entry) return value.replace(trimmed, entry[language]);
  const key = Object.entries(I18N.ja).find(([, text]) => text === trimmed)?.[0];
  if (key) return String(I18N[language][key as keyof typeof I18N.ja]);
  return value;
}
export function useUiText() {
  const language = useContext(UiLanguage);
  return (text: string) => translateUi(text, language);
}
export function UiText({ text }: { text: ReactNode }) {
  const ui = useUiText();
  return <>{typeof text === 'string' ? ui(text) : text}</>;
}
