---
id: reference-discipline
---

## Reference materials

When this project links **story assets** (characters, locations, props) to a frame, the image model may already use those references. For **motion**, your job is:

- **Preserve identity**: do not introduce a second face, hair style, or costume that conflicts with a named asset.
- **Cite in constraints**: in `negativeMotion`, forbid wrong wardrobe, extra characters, or duplicate props that would contradict the locked references.
- **Physics over lore**: prefer concrete motion and contact (hand meets surface, foot plants) over abstract adjectives.
- **No duplicate appearance prose**: the model sees the image; do not re-describe skin, wardrobe, or environment unless a change in motion is required.

Other toolchains sometimes use **tagged references** (e.g. `@image1`) in the prompt. This product uses **your story-asset set** and the **starting image**; express continuity by name in constraints and in `negativeMotion` when a wrong version would break the shot.
