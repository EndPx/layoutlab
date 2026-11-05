import { test, expect } from '@playwright/test';
test('visible human failure keeps cart and retries on new scene',async({page})=>{
 await page.route('**/worker-articulated-workwear-v2.gltf',r=>r.fulfill({status:503,body:'local intentional asset failure'}));
 await page.goto('/');await expect(page.getByRole('alert').filter({hasText:'Human model unavailable'})).toBeVisible({timeout:30000});
 const c=page.getByTestId('ops-canvas');await expect.poll(async()=>JSON.parse(await c.getAttribute('data-unit-transforms')??'[]').length).toBe(6);
 await page.unroute('**/worker-articulated-workwear-v2.gltf');await page.getByTestId('ws-scenario').selectOption('full');
 await expect(c).toHaveAttribute('data-human-asset-status','loaded-cyclic-gait',{timeout:30000});await expect(page.getByRole('alert').filter({hasText:'Human model unavailable'})).toHaveCount(0);
});
