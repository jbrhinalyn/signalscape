# M4.3 selectable background looks and sparkles — Issue #36

Five in-app cinematic scene **looks** can be chosen via the Background menu.
The approved Enchanted Forest remains the default. Four color-graded moods
(Moonlit Blue, Emerald Dawn, Golden Hour, Mystic Violet) reuse the **same bundled
forest artwork**, not four different paintings. This is deliberate and disclosed
in the selector. Future original artwork plates can replace each mood in the
asset registry without changing the camera or SDK layer.

- Choices are offline and stored as a non-sensitive visual preference in
  localStorage when available. Storage restrictions fall back to session-only.
- The selection works while camera preview or measurements are active and
  changes only the appearance of artwork layers.
- 96 independent glow stars render above the artwork via GPU shader points
  alongside existing 144 fireflies and water glints.
- Twinkling pauses when the app/window is hidden or reduced motion is active.
  Verified signals increase light sparkle subtly through existing validated
  visual-pose uniforms; no fake values or physiological waveforms are created.
- Camera permission remains opt-in, and stopped/unavailable readings remain
  withheld.

## Owner acceptance

1. Launch Electron with no camera; default Enchanted Forest is unchanged.
2. Open Background menu, switch through five looks; confirm text/controls
   remain legible, no duplicate panels or invented readings appear.
3. Restart; last selected look restores locally if storage is supported.
4. Enable camera preview and begin measurement; switching scenes must not stop
   SDK capture or reset live readings.
5. Stop measurement and camera; color selection must not reopen permission.
6. Compare animated sparkle density and GPU performance, with and without live
   validated signal data. Reduced motion should fully stop sparkle twinkle.
7. Keep #36 open until separate artwork images (#2–#5) and owner visual review
   are accepted if distinct compositions are required.
