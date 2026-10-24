import { Page, expect } from '@playwright/test';
import { PASSWORD } from './emulators';

export async function signIn(page: Page, email: string, path = '/login'): Promise<void> {
  await page.goto(path);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Ingresar' }).click();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL('/');
}

export const nav = (page: Page) => page.getByRole('navigation');
