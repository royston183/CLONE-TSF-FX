// The vendored screens ask for the workspace only to know who is acting (saved ALV layout sharing). Here that is the user
// signed in to this application.
import { createContext, useContext, type ReactNode } from 'react';
import type { WorkspaceInfo } from '@tsfx/lib/workspace-types';

const empty = { session: { actingUser: '' } } as unknown as WorkspaceInfo;
interface Value { workspace: WorkspaceInfo; reload: () => Promise<void>; signOut: () => Promise<void>; signingOut: boolean; error: string }
const value: Value = { workspace: empty, reload: async () => undefined, signOut: async () => undefined, signingOut: false, error: '' };
const Ctx = createContext<Value>(value);
export function WorkspaceProvider({ children }: { initial?: WorkspaceInfo; children: ReactNode }) { return <Ctx.Provider value={value}>{children}</Ctx.Provider>; }
export const useWorkspace = (): Value => useContext(Ctx);
