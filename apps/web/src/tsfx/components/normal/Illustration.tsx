// The Normal theme's spot illustrations (LAS components/Illustration.jsx): flat inline SVGs coloured only through CSS
// classes (shell.css maps them to the --illo-* and --status-* tokens), so the dark theme repaints them.
// Shape classes: nt-s surface · nt-p paper · nt-l outline · nt-lf placeholder line · nt-b blue · nt-bs soft blue ·
// nt-k ink · nt-y yellow · nt-r red · nt-g green · nt-n grey · nt-wf / nt-ws white fill / stroke over a coloured shape.
import type { ReactNode } from 'react';

export const ILLUSTRATIONS = ['empty', 'search', 'success', 'error', 'processing', 'collateral', 'customers', 'approval', 'analytics', 'wallet', 'onboarding', 'drawdown', 'bank'] as const;
export type IllustrationName = (typeof ILLUSTRATIONS)[number];

const Ground = () => <ellipse className="nt-p" cx="100" cy="128" rx="80" ry="8" />;

const Doc = ({ x = 60, y = 22, w = 80, h = 92 }: { x?: number; y?: number; w?: number; h?: number }) => (
  <>
    <rect className="nt-s nt-l" x={x} y={y} width={w} height={h} rx="6" />
    <rect className="nt-bs" x={x + 12} y={y + 14} width={w * 0.42} height="6" rx="3" />
    <rect className="nt-lf" x={x + 12} y={y + 28} width={w - 24} height="4" rx="2" />
    <rect className="nt-lf" x={x + 12} y={y + 38} width={w - 32} height="4" rx="2" />
    <rect className="nt-lf" x={x + 12} y={y + 48} width={w - 28} height="4" rx="2" />
  </>
);

const ART: Record<IllustrationName, ReactNode> = {
  // An empty tray: a folder with one blank page in it.
  empty: (
    <>
      <Ground />
      <path className="nt-bs" d="M36 46a6 6 0 0 1 6-6h30l10 10h76a6 6 0 0 1 6 6v58a6 6 0 0 1-6 6H42a6 6 0 0 1-6-6z" />
      <rect className="nt-s nt-l" x="58" y="24" width="84" height="70" rx="5" />
      <rect className="nt-bs" x="70" y="36" width="34" height="6" rx="3" />
      <rect className="nt-lf" x="70" y="49" width="60" height="4" rx="2" />
      <rect className="nt-lf" x="70" y="59" width="50" height="4" rx="2" />
      <path className="nt-b" d="M32 72a6 6 0 0 1 6-6h124a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6z" />
      <rect className="nt-s" x="86" y="86" width="28" height="5" rx="2.5" />
      <circle className="nt-y" cx="164" cy="30" r="4" />
      <circle className="nt-n" cx="30" cy="36" r="3" />
      <circle className="nt-g" cx="176" cy="54" r="2.5" />
    </>
  ),
  // A page under a magnifying glass: nothing matched the search.
  search: (
    <>
      <Ground />
      <Doc x={46} y={18} w={78} h={96} />
      <circle className="nt-s nt-l" cx="128" cy="78" r="26" strokeWidth="2" />
      <circle className="nt-bs" cx="128" cy="78" r="18" />
      <rect className="nt-k" x="144" y="96" width="10" height="30" rx="5" transform="rotate(-45 149 111)" />
      <path className="nt-l" d="M121 71l14 14M135 71l-14 14" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle className="nt-y" cx="40" cy="30" r="4" />
      <circle className="nt-n" cx="168" cy="40" r="3" />
    </>
  ),
  // A ledger page with a green tick: done.
  success: (
    <>
      <Ground />
      <Doc x={54} y={18} w={84} h={96} />
      <circle className="nt-g" cx="138" cy="88" r="22" />
      <path d="M127 88l8 8 15-16" className="nt-ws nt-draw" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="nt-y" cx="44" cy="34" r="4" />
      <circle className="nt-b" cx="166" cy="34" r="3" />
    </>
  ),
  // A page with a red warning sign: something failed.
  error: (
    <>
      <Ground />
      <Doc x={54} y={18} w={84} h={96} />
      <path className="nt-r" d="M134.5 64a4 4 0 0 1 7 0l23 40a4 4 0 0 1-3.5 6h-46a4 4 0 0 1-3.5-6z" />
      <rect x="135.5" y="76" width="5" height="17" rx="2.5" className="nt-wf" />
      <circle cx="138" cy="100" r="3" className="nt-wf" />
      <circle className="nt-n" cx="44" cy="34" r="3" />
      <circle className="nt-y" cx="166" cy="40" r="4" />
    </>
  ),
  // Papers moving through a gear: work in progress.
  processing: (
    <>
      <Ground />
      <rect className="nt-s nt-l" x="34" y="34" width="66" height="80" rx="6" />
      <rect className="nt-bs" x="44" y="46" width="30" height="6" rx="3" />
      <rect className="nt-lf" x="44" y="60" width="46" height="4" rx="2" />
      <rect className="nt-lf" x="44" y="70" width="38" height="4" rx="2" />
      <rect className="nt-lf" x="44" y="80" width="42" height="4" rx="2" />
      <g transform="translate(132 72)">
        <g className="nt-gear">
          <path className="nt-b" d="M-6-30h12l2 9 7 3 8-5 8 8-5 8 3 7 9 2v12l-9 2-3 7 5 8-8 8-8-5-7 3-2 9H-6l-2-9-7-3-8 5-8-8 5-8-3-7-9-2V-6l9-2 3-7-5-8 8-8 8 5 7-3z" />
          <circle className="nt-s" r="11" />
        </g>
      </g>
      <g className="nt-pulse-dots">
        <circle className="nt-y" cx="118" cy="122" r="3.5" />
        <circle className="nt-r" cx="130" cy="122" r="3.5" />
        <circle className="nt-g" cx="142" cy="122" r="3.5" />
        <circle className="nt-n" cx="154" cy="122" r="3.5" />
      </g>
    </>
  ),
  // A shield over a stack of coins: pledged collateral.
  collateral: (
    <>
      <Ground />
      <ellipse className="nt-bs" cx="70" cy="110" rx="26" ry="7" />
      <rect className="nt-bs" x="44" y="94" width="52" height="16" />
      <ellipse className="nt-s nt-l" cx="70" cy="94" rx="26" ry="7" />
      <ellipse className="nt-bs" cx="70" cy="86" rx="26" ry="7" />
      <rect className="nt-bs" x="44" y="72" width="52" height="14" />
      <ellipse className="nt-s nt-l" cx="70" cy="72" rx="26" ry="7" />
      <path className="nt-b" d="M132 20l34 12v28c0 26-16 44-34 52-18-8-34-26-34-52V32z" />
      <path d="M118 64l10 10 20-22" className="nt-ws nt-draw" fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="nt-y" cx="34" cy="40" r="4" />
      <circle className="nt-g" cx="178" cy="98" r="3" />
    </>
  ),
  // Two customer cards: a directory with no one in it yet.
  customers: (
    <>
      <Ground />
      <rect className="nt-s nt-l" x="30" y="40" width="80" height="76" rx="8" />
      <circle className="nt-bs" cx="70" cy="68" r="14" />
      <rect className="nt-lf" x="48" y="92" width="44" height="5" rx="2.5" />
      <rect className="nt-lf" x="56" y="102" width="28" height="4" rx="2" />
      <rect className="nt-s nt-l" x="90" y="24" width="80" height="84" rx="8" />
      <circle className="nt-b" cx="130" cy="54" r="15" />
      <path className="nt-b" d="M106 92c4-14 14-20 24-20s20 6 24 20z" />
      <circle className="nt-y" cx="164" cy="32" r="4" />
      <circle className="nt-n" cx="26" cy="30" r="3" />
    </>
  ),
  // A sanction stamped onto an application: approvals.
  approval: (
    <>
      <Ground />
      <Doc x={40} y={20} w={86} h={96} />
      <rect className="nt-lf" x="52" y="96" width="40" height="4" rx="2" />
      <g className="nt-stamp">
        <circle className="nt-g" cx="138" cy="78" r="26" />
        <circle className="nt-wf" cx="138" cy="78" r="19" />
        <circle className="nt-g" cx="138" cy="78" r="16" />
        <path d="M130 78l6 6 11-12" className="nt-ws nt-draw" fill="none" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle className="nt-y" cx="170" cy="30" r="4" />
      <circle className="nt-b" cx="30" cy="40" r="3" />
    </>
  ),
  // A board of rising bars and a trend line: reports and analytics.
  analytics: (
    <>
      <Ground />
      <rect className="nt-s nt-l" x="30" y="18" width="140" height="98" rx="8" />
      <rect className="nt-bs" x="42" y="30" width="44" height="6" rx="3" />
      <g className="nt-bars">
        <rect className="nt-b" x="48" y="72" width="14" height="32" rx="2" />
        <rect className="nt-g" x="72" y="60" width="14" height="44" rx="2" />
        <rect className="nt-y" x="96" y="78" width="14" height="26" rx="2" />
        <rect className="nt-b" x="120" y="50" width="14" height="54" rx="2" />
        <rect className="nt-n" x="144" y="66" width="14" height="38" rx="2" />
      </g>
      <path className="nt-trend" d="M50 64l24-14 24 16 24-26 24 12" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="nt-r" cx="170" cy="22" r="4" />
    </>
  ),
  // A wallet with a card and coins: payments and balances.
  wallet: (
    <>
      <Ground />
      <rect className="nt-bs" x="56" y="26" width="92" height="56" rx="8" transform="rotate(-8 102 54)" />
      <rect className="nt-b" x="40" y="48" width="120" height="70" rx="10" />
      <rect className="nt-k" x="118" y="70" width="48" height="26" rx="8" />
      <circle className="nt-y" cx="134" cy="83" r="6" />
      <rect className="nt-wf" x="54" y="62" width="40" height="5" rx="2.5" />
      <g className="nt-coins">
        <circle className="nt-y" cx="172" cy="40" r="9" />
        <circle className="nt-g" cx="30" cy="34" r="6" />
      </g>
    </>
  ),
  // An identity card with a verified tick beside a KYC page: onboarding.
  onboarding: (
    <>
      <Ground />
      <Doc x={104} y={16} w={66} h={92} />
      <rect className="nt-lf" x="116" y="80" width="34" height="4" rx="2" />
      <rect className="nt-s nt-l" x="26" y="42" width="98" height="64" rx="8" />
      <rect className="nt-b" x="26" y="42" width="98" height="14" rx="8" />
      <rect className="nt-b" x="26" y="50" width="98" height="6" />
      <circle className="nt-bs" cx="50" cy="78" r="11" />
      <path className="nt-b" d="M38 98c3-8 7-11 12-11s9 3 12 11z" />
      <rect className="nt-lf" x="70" y="68" width="40" height="5" rx="2.5" />
      <rect className="nt-lf" x="70" y="79" width="30" height="4" rx="2" />
      <rect className="nt-lf" x="70" y="88" width="36" height="4" rx="2" />
      <g className="nt-stamp">
        <circle className="nt-g" cx="150" cy="100" r="15" />
        <path d="M143 100l5 5 9-10" className="nt-ws nt-draw" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle className="nt-y" cx="30" cy="28" r="4" />
      <circle className="nt-n" cx="182" cy="40" r="3" />
    </>
  ),
  // Funds moving from a sanctioned limit to the borrower: drawdowns and disbursements.
  drawdown: (
    <>
      <Ground />
      <rect className="nt-s nt-l" x="22" y="34" width="66" height="78" rx="8" />
      <rect className="nt-bs" x="32" y="46" width="30" height="6" rx="3" />
      <rect className="nt-b" x="32" y="62" width="46" height="36" rx="4" />
      <rect className="nt-wf" x="38" y="70" width="22" height="4" rx="2" />
      <rect className="nt-wf" x="38" y="80" width="30" height="4" rx="2" />
      <path className="nt-trend" d="M96 72h30" fill="none" strokeWidth="3" strokeLinecap="round" />
      <path className="nt-trend" d="M118 63l10 9-10 9" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect className="nt-b" x="134" y="48" width="48" height="58" rx="8" />
      <g className="nt-coins">
        <circle className="nt-y" cx="158" cy="70" r="11" />
        <rect className="nt-k" x="146" y="88" width="24" height="5" rx="2.5" />
        <circle className="nt-g" cx="110" cy="40" r="5" />
      </g>
      <circle className="nt-n" cx="182" cy="30" r="3" />
    </>
  ),
  // A bank front: the sign-in and welcome illustration.
  bank: (
    <>
      <Ground />
      <path className="nt-b" d="M100 14l70 32H30z" />
      <rect className="nt-k" x="30" y="46" width="140" height="8" rx="2" />
      {[44, 76, 108, 140].map(x => <rect key={x} className="nt-s nt-l" x={x} y="60" width="16" height="48" rx="2" />)}
      <rect className="nt-k" x="24" y="110" width="152" height="10" rx="2" />
      <circle className="nt-s" cx="100" cy="34" r="6" />
      <circle className="nt-y" cx="182" cy="28" r="4" />
      <circle className="nt-g" cx="16" cy="64" r="3" />
    </>
  )
};

/** A spot illustration; decorative (hidden from assistive technology) unless it has a `label`. */
export function Illustration({ name, size = 160, label }: { name: IllustrationName; size?: number; label?: string }) {
  return (
    <svg className="nt-illo" viewBox="0 0 200 140" width={size} height={(size * 140) / 200}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} focusable="false">
      {ART[name] ?? ART.empty}
    </svg>
  );
}
