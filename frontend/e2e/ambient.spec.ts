import { expect, test, type Page } from '@playwright/test';

/** Lee las animaciones ambientales reales del navegador (Web Animations API). */
async function ambientAnimations(page: Page) {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest?.('.rc-ambient'))
      .map((a) => {
        const timing = a.effect!.getComputedTiming();
        return { name: (a as CSSAnimation).animationName, duration: timing.duration, iterations: timing.iterations };
      }),
  );
}

test.describe('ambient background', () => {
  test('every ambient animation lasts exactly 120 000 ms and loops infinitely', async ({ page }) => {
    await page.goto('/');
    const anims = await ambientAnimations(page);
    expect(anims.map((a) => a.name).sort()).toEqual(
      ['rc-ambient-drift', 'rc-ambient-drift', 'rc-ambient-teal', 'rc-ambient-turquoise', 'rc-ambient-violet'].sort(),
    );
    for (const a of anims) {
      expect(a.duration).toBe(120_000);
      expect(a.iterations).toBe(Infinity);
    }
  });

  test('colour sequence and return to the initial state at t = 120 s', async ({ page }) => {
    await page.goto('/');
    const sample = (t: number) =>
      page.evaluate((time) => {
        document.getAnimations().forEach((a) => { a.pause(); a.currentTime = time; });
        const op = (l: string) => Number(getComputedStyle(document.querySelector(`[data-layer="${l}"]`)!).opacity);
        const orb = getComputedStyle(document.querySelector('.rc-ambient__orb--a')!).transform;
        return { turquoise: op('turquoise'), teal: op('teal'), violet: op('violet'), orb };
      }, t);

    const start = await sample(0);
    expect(start).toMatchObject({ turquoise: 0, teal: 0, violet: 0 }); // deep space blue
    expect(await sample(30_000)).toMatchObject({ turquoise: 1, teal: 0, violet: 0 });
    expect(await sample(60_000)).toMatchObject({ teal: 1, violet: 0 });
    expect(await sample(90_000)).toMatchObject({ violet: 1 });
    const mid = await sample(105_000);
    expect(mid.violet).toBeGreaterThan(0);
    expect(mid.violet).toBeLessThan(1); // gradual fade back to blue
    expect(await sample(120_000)).toEqual(start); // full cycle returns to the original state
  });

  test('reduced motion: no ambient animation, stable blue background', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/');
    expect(await ambientAnimations(page)).toEqual([]);
    const violet = await page.locator('[data-layer="violet"]').evaluate((el) => getComputedStyle(el).opacity);
    expect(violet).toBe('0');
    await ctx.close();
  });

  test('in-app reduced-motion preference also stops the animation', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /^(Reducido|Reduced)$/ }).click();
    expect(await ambientAnimations(page)).toEqual([]);
  });
});
