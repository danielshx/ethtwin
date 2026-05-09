import { Composition } from "remotion"
import { EthTwinDemo } from "./Composition"
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./tokens"
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist"

loadGeist()

export function RemotionRoot() {
  return (
    <Composition
      id="EthTwinDemo"
      component={EthTwinDemo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  )
}
