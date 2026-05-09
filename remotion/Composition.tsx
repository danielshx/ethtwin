import { AbsoluteFill, Sequence } from "remotion"
import { SCENES, colors } from "./tokens"
import { ColdOpen } from "./scenes/ColdOpen"
import { MariaIntro } from "./scenes/MariaIntro"
import { VoiceSend } from "./scenes/VoiceSend"
import { PostcardConfetti } from "./scenes/PostcardConfetti"
import { CosmicReveal } from "./scenes/CosmicReveal"
import { XRayReveal } from "./scenes/XRayReveal"
import { Outro } from "./scenes/Outro"

export function EthTwinDemo() {
  return (
    <AbsoluteFill style={{ background: colors.cream }}>
      <Sequence from={SCENES.coldOpen.from} durationInFrames={SCENES.coldOpen.dur}>
        <ColdOpen />
      </Sequence>
      <Sequence from={SCENES.mariaIntro.from} durationInFrames={SCENES.mariaIntro.dur}>
        <MariaIntro />
      </Sequence>
      <Sequence from={SCENES.voiceSend.from} durationInFrames={SCENES.voiceSend.dur}>
        <VoiceSend />
      </Sequence>
      <Sequence from={SCENES.postcard.from} durationInFrames={SCENES.postcard.dur}>
        <PostcardConfetti />
      </Sequence>
      <Sequence from={SCENES.cosmic.from} durationInFrames={SCENES.cosmic.dur}>
        <CosmicReveal />
      </Sequence>
      <Sequence from={SCENES.xray.from} durationInFrames={SCENES.xray.dur}>
        <XRayReveal />
      </Sequence>
      <Sequence from={SCENES.outro.from} durationInFrames={SCENES.outro.dur}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  )
}
