import React, { useEffect, useState } from 'react'
import { XStack, SizableText } from 'tamagui'
import { Network } from '@tamagui/lucide-icons'
import NavigationButtons from './NavigationButtons'

export const titleBarHeight = '30px'

interface TitleBarProps {
  activePanel: 'claimGraph' | null
  togglePanel: (panel: 'claimGraph' | null) => void
}

const TitleBar: React.FC<TitleBarProps> = ({ activePanel, togglePanel }) => {
  const [platform, setPlatform] = useState('')

  useEffect(() => {
    const fetchPlatform = async () => {
      const response = await window.electronUtils.getPlatform()
      setPlatform(response)
    }
    fetchPlatform()
  }, [])

  return (
    <XStack alignItems="center" backgroundColor="$gray3" className="electron-drag flex justify-between bg-[#1a1a2e]">
      <div
        className="mt-px flex items-center"
        style={platform === 'darwin' ? { marginLeft: '65px' } : { marginLeft: '8px' }}
      >
        <NavigationButtons />
        <SizableText color="$blue10" fontSize={13} fontWeight="600" className="ml-3 tracking-wide">
          Coherence Engine
        </SizableText>
      </div>

      <XStack
        className="electron-no-drag flex items-center justify-end"
        style={platform === 'win32' ? { marginRight: '8.5rem' } : { marginRight: '0.5rem' }}
      >
        <XStack
          onPress={() => togglePanel(activePanel === 'claimGraph' ? null : 'claimGraph')}
          className="cursor-pointer rounded px-2 py-1 hover:bg-white/10"
          alignItems="center"
          gap={4}
        >
          <Network size={18} color={activePanel === 'claimGraph' ? '$blue9' : '$gray10'} />
          <SizableText fontSize={12} color={activePanel === 'claimGraph' ? '$blue9' : '$gray10'}>
            Grafo de Claims
          </SizableText>
        </XStack>
      </XStack>
    </XStack>
  )
}

export default TitleBar
