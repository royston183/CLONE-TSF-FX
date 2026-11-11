import type { LayoutMeta, LayoutScope, LayoutState, SavedLayout } from '@tsfx/lib/report/types';

export interface ActiveLayout { name: string; scope: LayoutScope }
export interface AlvLayout {
  layout: LayoutState;
  active: ActiveLayout | null;
  modified: boolean;
  layouts: SavedLayout[];
  error: string;
  ready: boolean;
  select: (saved: SavedLayout | null) => void;
  change: (next: LayoutState) => void;
  save: (meta: LayoutMeta, layout: LayoutState) => Promise<void>;
  remove: () => Promise<void>;
}
