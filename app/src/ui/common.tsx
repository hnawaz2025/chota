/** Shared UI components: the Urdu-first label with English subtitle (T), icon boxes, Modal and a settings row. */
import { type ReactNode } from 'react'
import { lsGet } from './constants'

/** Numbers carry the meaning for herders who read digits better than words: make them bigger and bolder. */
export function Emph({ s }: { s: string }) {
  const parts = s.split(/(\d+(?:\.\d+)?)/)
  return <>{parts.map((p, i) => i % 2 ? <b key={i} className="n">{p}</b> : p)}</>
}

/** Urdu line with optional English subtitle. */
export function T({ ur, en, big, emph }: { ur: string; en?: string; big?: boolean; emph?: boolean }) {
  const showEn = lsGet('chota.en') !== '0'
  return <span className={big ? 'tx big' : 'tx'}><span className="ur" dir="rtl">{emph ? <Emph s={ur} /> : ur}</span>{showEn && en && <span className="en" dir="ltr">{en}</span>}</span>
}

/** An icon in its own box (never inline-touching text). */
export function I({ c }: { c: string }) { return <span className="ic" aria-hidden="true">{c}</span> }

/** Icon + label row, RTL: the icon sits at the start with a fixed gap. */
export function Lab({ ic, ...t }: { ic: string; ur: string; en?: string; big?: boolean; emph?: boolean }) {
  return <span className="lab" dir="rtl"><I c={ic} /><T {...t} /></span>
}

/** A settings card. */
export function Row({ children }: { children: ReactNode }) { return <div className="card set">{children}</div> }

/** A bottom-sheet dialog; tapping outside calls onClose. */
export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="modal-bg" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>{children}</div></div>
}
