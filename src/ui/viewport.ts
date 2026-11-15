// First visible index for a list of `total` rows shown `height` at a time,
// keeping `selected` on screen with the cursor roughly centred.
export function viewportStart(total: number, selected: number, height: number): number {
	if (height <= 0 || total <= height) return 0;
	const clamped = Math.min(Math.max(0, selected), total - 1);
	const start = clamped - Math.floor(height / 2);
	return Math.min(Math.max(0, start), total - height);
}
