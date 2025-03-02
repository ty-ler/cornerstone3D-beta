import { cache, getEnabledElement, StackViewport } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { BaseTool } from '../base';
import { PublicToolProps, ToolProps, EventTypes } from '../../types';

import { fillInsideCircle } from './strategies/fillCircle';
import { Events } from '../../enums';
import { drawCircle as drawCircleSvg } from '../../drawingSvg';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';

import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import {
  segmentLocking,
  activeSegmentation,
  segmentIndex as segmentIndexController,
  config as segmentationConfig,
} from '../../stateManagement/segmentation';
import { getSegmentation } from '../../stateManagement/segmentation/segmentationState';
/**
 * Tool for manipulating segmentation data by drawing a circle. It acts on the
 * active Segmentation on the viewport (enabled element) and requires an active
 * segmentation to be already present. By default it will use the activeSegmentIndex
 * for the segmentation to modify. You can use SegmentationModule to set the active
 * segmentation and segmentIndex.
 */
export default class CircleScissorsTool extends BaseTool {
  static toolName = 'CircleScissor';
  editData: {
    annotation: any;
    segmentation: any;
    segmentIndex: number;
    segmentationId: string;
    segmentsLocked: number[];
    segmentColor: [number, number, number, number];
    viewportIdsToRender: string[];
    handleIndex?: number;
    movingTextBox: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
    centerCanvas?: Array<number>;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        strategies: {
          FILL_INSIDE: fillInsideCircle,
          // ERASE_INSIDE: eraseInsideCircle,
        },
        defaultStrategy: 'FILL_INSIDE',
        activeStrategy: 'FILL_INSIDE',
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Based on the current position of the mouse and the enabledElement, it
   * finds the active segmentation info and use it for the current tool.
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  preMouseDownCallback = (
    evt: EventTypes.MouseDownActivateEventType
  ): boolean => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const canvasPos = currentPoints.canvas;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;
    const toolGroupId = this.toolGroupId;

    const activeSegmentationRepresentation =
      activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
    if (!activeSegmentationRepresentation) {
      throw new Error(
        'No active segmentation detected, create one before using scissors tool'
      );
    }

    const { segmentationRepresentationUID, segmentationId, type } =
      activeSegmentationRepresentation;
    const segmentIndex =
      segmentIndexController.getActiveSegmentIndex(segmentationId);
    const segmentsLocked = segmentLocking.getLockedSegments(segmentationId);

    const segmentColor = segmentationConfig.color.getColorForSegmentIndex(
      toolGroupId,
      segmentationRepresentationUID,
      segmentIndex
    );

    const { representationData } = getSegmentation(segmentationId);

    // Todo: are we going to support contour editing with rectangle scissors?
    const { volumeId } = representationData[type];
    const segmentation = cache.getVolume(volumeId);

    // Todo: Used for drawing the svg only, we might not need it at all
    const annotation = {
      invalidated: true,
      highlighted: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: '',
        toolName: CircleScissorsTool.toolName,
        segmentColor,
      },
      data: {
        handles: {
          points: [[...worldPos], [...worldPos], [...worldPos], [...worldPos]],
          activeHandleIndex: null,
        },
        isDrawing: true,
        cachedStats: {},
      },
    };

    const viewportIdsToRender = [viewport.id];

    this.editData = {
      annotation,
      segmentation,
      centerCanvas: canvasPos,
      segmentIndex,
      segmentationId,
      segmentsLocked,
      segmentColor,
      viewportIdsToRender,
      handleIndex: 3,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
    };

    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return true;
  };

  _mouseDragCallback = (evt: EventTypes.MouseDragEventType) => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { currentPoints } = eventDetail;
    const currentCanvasPoints = currentPoints.canvas;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;
    const { canvasToWorld } = viewport;

    //////
    const { annotation, viewportIdsToRender, centerCanvas } = this.editData;
    const { data } = annotation;

    // Center of circle in canvas Coordinates

    const dX = Math.abs(currentCanvasPoints[0] - centerCanvas[0]);
    const dY = Math.abs(currentCanvasPoints[1] - centerCanvas[1]);
    const radius = Math.sqrt(dX * dX + dY * dY);

    const bottomCanvas: Types.Point2 = [
      centerCanvas[0],
      centerCanvas[1] + radius,
    ];
    const topCanvas: Types.Point2 = [centerCanvas[0], centerCanvas[1] - radius];
    const leftCanvas: Types.Point2 = [
      centerCanvas[0] - radius,
      centerCanvas[1],
    ];
    const rightCanvas: Types.Point2 = [
      centerCanvas[0] + radius,
      centerCanvas[1],
    ];

    data.handles.points = [
      canvasToWorld(bottomCanvas),
      canvasToWorld(topCanvas),
      canvasToWorld(leftCanvas),
      canvasToWorld(rightCanvas),
    ];

    annotation.invalidated = true;

    this.editData.hasMoved = true;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  _mouseUpCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const {
      annotation,
      newAnnotation,
      hasMoved,
      segmentation,
      segmentIndex,
      segmentsLocked,
      segmentationId,
    } = this.editData;
    const { data } = annotation;
    const { viewPlaneNormal, viewUp } = annotation.metadata;

    if (newAnnotation && !hasMoved) {
      return;
    }

    annotation.highlighted = false;
    data.handles.activeHandleIndex = null;

    this._deactivateDraw(element);

    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    this.editData = null;
    this.isDrawing = false;

    if (viewport instanceof StackViewport) {
      throw new Error('Not implemented yet');
    }

    const operationData = {
      points: data.handles.points,
      volume: segmentation,
      segmentIndex,
      segmentsLocked,
      viewPlaneNormal,
      segmentationId,
      viewUp,
    };

    this.applyActiveStrategy(enabledElement, operationData);
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event propagation.
   */
  _activateDraw = (element) => {
    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._mouseDragCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._mouseUpCallback);

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _deactivateDraw = (element) => {
    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._mouseDragCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._mouseUpCallback);

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  };

  /**
   * it is used to draw the circleScissor annotation in each
   * request animation frame. Note that the annotation are disappeared
   * after the segmentation modification.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any
  ): void => {
    if (!this.editData) {
      return;
    }

    const { viewport } = enabledElement;
    const { viewportIdsToRender } = this.editData;

    if (!viewportIdsToRender.includes(viewport.id)) {
      return;
    }

    const { annotation } = this.editData;

    // Todo: rectangle color based on segment index
    const toolMetadata = annotation.metadata;
    const annotationUID = annotation.annotationUID;

    const data = annotation.data;
    const { points } = data.handles;
    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

    const bottom = canvasCoordinates[0];
    const top = canvasCoordinates[1];

    const center = [
      Math.floor((bottom[0] + top[0]) / 2),
      Math.floor((bottom[1] + top[1]) / 2),
    ];

    const radius = Math.abs(bottom[1] - Math.floor((bottom[1] + top[1]) / 2));

    const color = `rgb(${toolMetadata.segmentColor.slice(0, 3)})`;

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed');
      return;
    }

    const circleUID = '0';
    drawCircleSvg(
      svgDrawingHelper,
      CircleScissorsTool.toolName,
      annotationUID,
      circleUID,
      center as Types.Point2,
      radius,
      {
        color,
      }
    );
  };
}
