export function WarpShaderBackground() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="absolute -inset-[20%] warp-bg" />
    </div>
  );
}
