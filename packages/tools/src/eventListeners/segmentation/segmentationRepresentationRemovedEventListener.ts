import triggerSegmentationRender from '../../utilities/triggerSegmentationRender';
import { SegmentationRepresentationRemovedEventType } from '../../types/EventTypes';

/** A function that listens to the `segmentationStateModified` event and triggers
 * the `triggerSegmentationRender` function. This function is called when the
 * segmentation state or config is modified.
 */
const segmentationRepresentationRemovedEventListener = function (
  evt: SegmentationRepresentationRemovedEventType
): void {
  const { toolGroupId, segmentationRepresentationUID } = evt.detail;
  triggerSegmentationRender(toolGroupId);
};

export default segmentationRepresentationRemovedEventListener;
