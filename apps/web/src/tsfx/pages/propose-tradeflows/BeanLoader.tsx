// The loading screen of the Trade Flows pages: no technical words, only the client's product lines, one after another,
// each with its own little illustration, and a thin bar that fills as the data arrives.
import { useEffect, useState } from 'react';
import { nextStart, readLast, rememberStart } from './start-line';
import './bean-loader.css';

const LINES: { name: string; text: string; art: 'cocoa' | 'coffee' | 'nuts' | 'spices' | 'dairy' }[] = [
  { name: 'Cocoa', text: 'Sourced globally and processed into products like deZaan powders, butters and liquors.', art: 'cocoa' },
  { name: 'Coffee', text: 'Green coffee beans and custom soluble and instant coffee solutions.', art: 'coffee' },
  { name: 'Nuts', text: 'Almonds, cashews, hazelnuts, pistachios and peanuts.', art: 'nuts' },
  { name: 'Spices', text: 'Bulk natural spices, herbs and dehydrated vegetables.', art: 'spices' },
  { name: 'Dairy', text: 'Sourced and processed dairy ingredients.', art: 'dairy' }
];

/**
 * "Did you know?" facts, a few per product line. `ofi` facts are only what the application itself already states about the
 * company's product lines or its name; everything else is a general fact about the commodity. Add a fact here, nowhere else.
 */
type Fact = { kind: 'ofi' | 'general'; text: string };
const FACTS: Record<(typeof LINES)[number]['art'], Fact[]> = {
  cocoa: [
    { kind: 'ofi', text: 'ofi turns cocoa into powders, butters and liquors under its deZaan range, the three cocoa products you assign BLs for here.' },
    { kind: 'general', text: 'A cocoa tree takes about three to five years to bear its first pods, and each pod holds roughly 30 to 50 beans.' },
    { kind: 'general', text: 'Cocoa butter is the natural fat of the bean; it melts close to body temperature, which is why chocolate melts in the mouth.' }
  ],
  coffee: [
    { kind: 'ofi', text: 'ofi supplies green coffee beans and also makes custom soluble and instant coffee for its customers.' },
    { kind: 'general', text: 'A coffee bean is the seed of a cherry; Arabica and Robusta are the two species that make up almost all the coffee traded.' },
    { kind: 'general', text: 'Robusta usually carries about twice the caffeine of Arabica, which is part of why it is popular in instant coffee.' }
  ],
  nuts: [
    { kind: 'ofi', text: "The ofi nut range covers almonds, cashews, hazelnuts, pistachios and peanuts." },
    { kind: 'general', text: 'An almond is the seed of a fruit related to the peach, and a cashew grows hanging from the bottom of its fruit, the cashew apple.' },
    { kind: 'general', text: 'Despite the name, the peanut is a legume that ripens underground, not a tree nut.' }
  ],
  spices: [
    { kind: 'ofi', text: 'ofi sells bulk natural spices, herbs and dehydrated vegetables.' },
    { kind: 'general', text: 'Black pepper is the dried berry of a climbing vine, and peppercorns turn from green to black as they are dried.' },
    { kind: 'general', text: 'Chilli heat comes from capsaicin, which is concentrated in the white ribs of the pepper more than in the seeds.' }
  ],
  dairy: [
    { kind: 'ofi', text: 'ofi sources and processes dairy ingredients, one of its five product lines alongside cocoa, coffee, nuts and spices.' },
    { kind: 'general', text: 'It takes roughly ten litres of milk to make one kilogram of hard cheese.' },
    { kind: 'general', text: 'Powdered milk is made by spray-drying: milk is sprayed into hot air and the water leaves in a fraction of a second.' }
  ]
};

function Art({ kind }: { kind: (typeof LINES)[number]['art'] }) {
  return (
    <svg className={`bean-loader__art bean-loader__art--${kind}`} viewBox="0 0 160 140" aria-hidden="true">
      {kind === 'cocoa' && <>
        <g className="bl-sway">
          <path className="bl-pod" d="M80 18 C112 26 120 74 104 104 C96 120 64 120 56 104 C40 74 48 26 80 18 Z" />
          <path className="bl-ridge" d="M80 22 C76 50 76 86 80 116 M66 30 C58 56 58 90 66 112 M94 30 C102 56 102 90 94 112" />
        </g>
        <ellipse className="bl-bean bl-drop" cx="38" cy="96" rx="8" ry="11" />
        <ellipse className="bl-bean bl-drop bl-d2" cx="124" cy="92" rx="7" ry="10" />
      </>}
      {kind === 'coffee' && <>
        <g className="bl-steam"><path d="M66 40 q-6 -8 0 -16 q6 -8 0 -16" /><path d="M80 40 q-6 -8 0 -16 q6 -8 0 -16" /><path d="M94 40 q-6 -8 0 -16 q6 -8 0 -16" /></g>
        <path className="bl-cup" d="M52 48 h56 v22 a28 28 0 0 1 -28 28 a28 28 0 0 1 -28 -28 z" />
        <path className="bl-handle" d="M108 54 h6 a9 9 0 0 1 0 18 h-7" />
        <ellipse className="bl-cream" cx="80" cy="50" rx="26" ry="4" />
        <ellipse className="bl-saucer" cx="80" cy="104" rx="40" ry="6" />
        <g className="bl-orbit"><ellipse className="bl-coffee" cx="80" cy="12" rx="6" ry="8.5" /><ellipse className="bl-coffee" cx="132" cy="84" rx="5.5" ry="8" /><ellipse className="bl-coffee" cx="28" cy="84" rx="5.5" ry="8" /></g>
      </>}
      {kind === 'nuts' && <>
        <g className="bl-hop"><path className="bl-almond" d="M50 96 C34 70 46 36 62 30 C78 36 84 70 70 96 C64 104 56 104 50 96 Z" /></g>
        <g className="bl-hop bl-h2"><path className="bl-cashew" d="M104 40 C126 44 130 76 112 92 C104 98 92 94 96 86 C108 76 106 58 96 54 C88 50 92 38 104 40 Z" /></g>
        <g className="bl-hop bl-h3"><circle className="bl-hazel" cx="84" cy="104" r="14" /><path className="bl-hazel-cap" d="M70 100 q14 -18 28 0 q-14 -6 -28 0 Z" /></g>
      </>}
      {kind === 'spices' && <>
        <g className="bl-sway"><path className="bl-chili" d="M46 46 C66 54 96 82 112 112 C92 104 60 80 46 46 Z" /><path className="bl-stem" d="M46 46 q-6 -10 2 -18" /></g>
        <g className="bl-sway bl-s2"><path className="bl-leaf" d="M104 24 C128 30 132 58 112 70 C96 62 92 38 104 24 Z" /><path className="bl-vein" d="M106 28 C110 42 112 54 112 68" /></g>
        <circle className="bl-seed bl-drop" cx="40" cy="100" r="4" /><circle className="bl-seed bl-drop bl-d2" cx="54" cy="112" r="3" /><circle className="bl-seed bl-drop" cx="128" cy="104" r="3.5" />
      </>}
      {kind === 'dairy' && <>
        <path className="bl-bottle" d="M68 22 h24 v12 l10 16 v58 a8 8 0 0 1 -8 8 h-28 a8 8 0 0 1 -8 -8 v-58 l10 -16 z" />
        <rect className="bl-milk" x="59" y="64" width="42" height="50" rx="6" />
        <path className="bl-cap" d="M66 16 h28 v8 h-28 z" />
        <path className="bl-splash bl-drop" d="M120 70 c8 12 8 22 0 26 c-8 -4 -8 -14 0 -26 z" />
        <path className="bl-splash bl-drop bl-d2" d="M36 82 c6 9 6 16 0 19 c-6 -3 -6 -10 0 -19 z" />
      </>}
    </svg>
  );
}

export function BeanLoader({ steps }: { steps: { done: boolean }[] }) {
  // Each opening starts on the next line after the previous one; the starting line is stored once, and the automatic changes never touch it.
  const [start] = useState(() => nextStart(readLast(), LINES.length));
  const [at, setAt] = useState(start);
  useEffect(() => { rememberStart(start); }, [start]);
  useEffect(() => {
    const t = setInterval(() => setAt(n => { const next = (n + 1) % LINES.length; if (next === 0) setRound(r => r + 1); return next; }), 8000);
    return () => clearInterval(t);
  }, []);
  const share = Math.round((steps.filter(s => s.done).length / Math.max(1, steps.length)) * 100);
  const line = LINES[at];
  // The next fact of this line each time the line comes round; no timer of its own.
  const [round, setRound] = useState(0);
  const facts = FACTS[line.art];
  const fact = facts[round % facts.length];
  return (
    <div className="bean-loader panel" role="status" aria-live="polite" aria-label="Getting everything ready">
      <div className="bean-loader__slide" key={line.name}>
        <Art kind={line.art} />
        <div className="bean-loader__text">
          <h3>{line.name}</h3>
          <p>{line.text}</p>
          <div className="bean-loader__fact">
            <span className="bean-loader__fact-head"><strong>Did you know?</strong><em className={`bean-loader__tag bean-loader__tag--${fact.kind}`}>{fact.kind === 'ofi' ? 'ofi' : 'General fact'}</em></span>
            <p>{fact.text}</p>
          </div>
        </div>
      </div>
      <div className="bean-loader__foot">
        <div className="bean-loader__dots" aria-hidden="true">{LINES.map((l, i) => <span key={l.name} className={i === at ? 'on' : ''} />)}</div>
        <div className="bean-loader__bar" aria-hidden="true"><span style={{ width: `${Math.max(8, share)}%` }} /></div>
      </div>
    </div>
  );
}
