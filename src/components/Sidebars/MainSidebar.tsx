import React, { useState } from 'react'

import { DBQueryResult } from 'electron/main/vector-database/schema'

import { YStack } from 'tamagui'
import SearchComponent from './SearchComponent'
import { useChatContext } from '@/contexts/ChatContext'
import FileSidebar from './FileSideBar/FileSidebar'
import IngestSidebar from './IngestSidebar'
import BrainSidebar from '../Brain/BrainSidebar'

export type SidebarAbleToShow = 'files' | 'search' | 'chats' | 'ingest' | 'brain'

const SidebarManager: React.FC = () => {
  const { sidebarShowing } = useChatContext()

  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchResults, setSearchResults] = useState<DBQueryResult[]>([])

  return (
    <YStack className="size-full overflow-y-hidden">
      {sidebarShowing === 'files' && <FileSidebar />}
      {sidebarShowing === 'search' && (
        <SearchComponent
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchResults={searchResults}
          setSearchResults={setSearchResults}
        />
      )}
      {sidebarShowing === 'ingest' && <IngestSidebar />}
      {sidebarShowing === 'brain' && <BrainSidebar />}
    </YStack>
  )
}

export default SidebarManager
