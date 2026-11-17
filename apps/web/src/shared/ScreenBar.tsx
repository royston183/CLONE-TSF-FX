// The slim bar every application screen (outside the Trade Flows frame, which has its own header) opens under: the
// Fourth Signal mark and the screen's name. It lives above the screen, so no screen's own header, buttons or workflow is touched.
import { FX_LOGO } from './fx/logo.ts'
import { screenInfo } from './screenInfo.ts'
import './screen-bar.css'

export function ScreenBar({ appId }: { appId: string }) {
  const { title } = screenInfo(appId)
  if (!title) return null
  return (
    <div className="fs-bar" role="banner">
      <img className="fs-bar__logo" src={FX_LOGO} alt="Fourth Signal" />
      <span className="fs-bar__title">{title}</span>
    </div>
  )
}
