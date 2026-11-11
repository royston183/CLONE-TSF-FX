// What the shell knows about the workspace (built in the browser by lib/client/workspace.ts); no server imports here.
/** The tab's SAP account: tested and accepted, not usable (sapError says why), being checked, or not tested / none. */
export type SapStatus = 'connected' | 'checking' | 'unavailable' | 'none';
export interface SessionInfo {
  /** The app login (demo). */
  username: string;
  /** The tab's SAP user ('' when none is set). */
  sapUsername: string;
  /** Who acts in the application's own data (layouts, created/changed by): the SAP user, else DEMO. */
  actingUser: string;
  sapStatus: SapStatus;
  sapError: string;
  checkedAt: string | null;
}
export interface ServiceInfo {
  key: string;
  title: string;
  binding: string;
  /** The service root on the SAP host. */
  path: string;
  /** The service root on the SAP relay. */
  url: string;
}
export interface WorkspaceInfo {
  session: SessionInfo | null;
  systemId: string;
  /** The tab's SAP client. */
  client: string;
  relayUrl: string;
  /** The application reads SAP through the relay (false: no module's data is inside SAP). */
  usesSap: boolean;
  services: ServiceInfo[];
  /** The UI Gallery is available (development, or no SAP service). */
  gallery: boolean;
}
