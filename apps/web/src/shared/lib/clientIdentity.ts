const TAB_ID_KEY = "new-mj:tab-id";
const BROWSER_ID_KEY = "new-mj:browser-id";

/** Per-tab identity: sessionStorage survives reload but not opening a new tab. */
export function getTabId(): string {
  let id = sessionStorage.getItem(TAB_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(TAB_ID_KEY, id);
  }
  return id;
}

/** Per-browser identity: localStorage is shared by every tab of this origin. */
export function getBrowserId(): string {
  let id = localStorage.getItem(BROWSER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(BROWSER_ID_KEY, id);
  }
  return id;
}
