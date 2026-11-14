// Requests for the plane page made from elsewhere, such as the command palette: open the shortcut sheet, replay
// the story intro. The plane page (pages/Home.tsx) is lazy-loaded, so it may not be mounted when the request is
// made. The request therefore waits here until Home takes it: on mount, or at once through the event when Home is
// already open. Nothing here is timed, so a slow download never loses a request.

export type PlaneRequest = "shortcuts" | "intro";

export const PLANE_REQUEST_EVENT = "redshift:plane-request";

let pending: PlaneRequest | null = null;

/** Ask the plane page to do something, now if it is open, or as soon as it mounts. */
export function requestPlane(r: PlaneRequest): void {
  pending = r;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PLANE_REQUEST_EVENT));
}

/** The waiting request, if any, which is cleared as it is taken. */
export function takePlaneRequest(): PlaneRequest | null {
  const r = pending;
  pending = null;
  return r;
}
