import { RemoveScroll } from 'react-remove-scroll'

import { PhotoViewer } from '~/components/ui/photo-viewer'
import { RootPortal } from '~/components/ui/portal'
import { usePhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'

export const Component = () => {
  const photoViewer = usePhotoViewer()
  const photos = usePhotos()
  return (
    <RootPortal>
      <RemoveScroll className="fixed inset-0 z-[9999]">
        <PhotoViewer
          photos={photos}
          currentIndex={photoViewer.currentIndex}
          isOpen={photoViewer.isOpen}
          onClose={photoViewer.closeViewer}
          onIndexChange={photoViewer.goToIndex}
        />
      </RemoveScroll>
    </RootPortal>
  )
}
