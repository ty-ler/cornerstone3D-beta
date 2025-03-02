import { vec3 } from 'gl-matrix';

import cache from '../cache';
import ViewportType from '../enums/ViewportType';
import Viewport from './Viewport';
import { createVolumeActor } from './helpers';
import { loadVolume } from '../volumeLoader';
import vtkSlabCamera from './vtkClasses/vtkSlabCamera';
import { getShouldUseCPURendering } from '../init';
import type { vtkSlabCamera as vtkSlabCameraType } from './vtkClasses/vtkSlabCamera';
import transformWorldToIndex from '../utilities/transformWorldToIndex';
import type {
  Point2,
  Point3,
  IImageData,
  IVolumeInput,
  ActorEntry,
  FlipDirection,
} from '../types';
import type { ViewportInput } from '../types/IViewport';
import type IVolumeViewport from '../types/IVolumeViewport';

const EPSILON = 1e-3;

/**
 * An object representing a VolumeViewport. VolumeViewports are used to render
 * 3D volumes from which various orientations can be viewed. Since VolumeViewports
 * use SharedVolumeMappers behind the scene, memory footprint of visualizations
 * of the same volume in different orientations is very small.
 *
 * For setting volumes on viewports you need to use {@link addVolumesToViewports}
 * which will add volumes to the specified viewports.
 */
class VolumeViewport extends Viewport implements IVolumeViewport {
  useCPURendering = false;
  private _FrameOfReferenceUID: string;

  constructor(props: ViewportInput) {
    super(props);

    this.useCPURendering = getShouldUseCPURendering();

    if (this.useCPURendering) {
      throw new Error(
        'VolumeViewports cannot be used whilst CPU Fallback Rendering is enabled.'
      );
    }

    const renderer = this.getRenderer();

    const camera = vtkSlabCamera.newInstance();
    renderer.setActiveCamera(camera);

    switch (this.type) {
      case ViewportType.ORTHOGRAPHIC:
        camera.setParallelProjection(true);
        break;
      case ViewportType.PERSPECTIVE:
        camera.setParallelProjection(false);
        break;
      default:
        throw new Error(`Unrecognized viewport type: ${this.type}`);
    }

    const { sliceNormal, viewUp } = this.defaultOptions.orientation;

    camera.setDirectionOfProjection(
      -sliceNormal[0],
      -sliceNormal[1],
      -sliceNormal[2]
    );
    camera.setViewUpFrom(viewUp);
    camera.setFreezeFocalPoint(true);

    this.resetCamera();
  }

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  /**
   * Creates volume actors for all volumes defined in the `volumeInputArray`.
   * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
   * For each entry, if a `blendMode` and/or `slabThickness` is defined, this will be set on the actor's
   * `VolumeMapper`.
   *
   * @param volumeInputArray - The array of `VolumeInput`s which define the volumes to add.
   * @param immediate - Whether the `Viewport` should be rendered as soon as volumes are added.
   */
  public async setVolumes(
    volumeInputArray: Array<IVolumeInput>,
    immediate = false
  ): Promise<void> {
    const firstImageVolume = cache.getVolume(volumeInputArray[0].volumeId);

    if (!firstImageVolume) {
      throw new Error(
        `imageVolume with id: ${firstImageVolume.volumeId} does not exist`
      );
    }

    const FrameOfReferenceUID = firstImageVolume.metadata.FrameOfReferenceUID;

    await this._isValidVolumeInputArray(volumeInputArray, FrameOfReferenceUID);

    this._FrameOfReferenceUID = FrameOfReferenceUID;

    const slabThicknessValues = [];
    const volumeActors = [];

    // One actor per volume
    for (let i = 0; i < volumeInputArray.length; i++) {
      const { volumeId, slabThickness, actorUID } = volumeInputArray[i];
      const volumeActor = await createVolumeActor(volumeInputArray[i]);

      // We cannot use only volumeId since then we cannot have for instance more
      // than one representation of the same volume (since actors would have the
      // same name, and we don't allow that) AND We cannot use only any uid, since
      // we rely on the volume in the cache for mapper. So we prefer actorUID if
      // it is defined, otherwise we use volumeId for the actor name.
      const uid = actorUID || volumeId;
      volumeActors.push({ uid, volumeActor, slabThickness });

      if (
        slabThickness !== undefined &&
        !slabThicknessValues.includes(slabThickness)
      ) {
        slabThicknessValues.push(slabThickness);
      }
    }

    if (slabThicknessValues.length > 1) {
      console.warn(
        'Currently slab thickness for intensity projections is tied to the camera, not per volume, using the largest of the two volumes for this viewport.'
      );
    }

    this._setVolumeActors(volumeActors);

    if (immediate) {
      this.render();
    }
  }

  /**
   * Creates and adds volume actors for all volumes defined in the `volumeInputArray`.
   * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
   *
   * @param volumeInputArray - The array of `VolumeInput`s which define the volumes to add.
   * @param immediate - Whether the `Viewport` should be rendered as soon as volumes are added.
   */
  public async addVolumes(
    volumeInputArray: Array<IVolumeInput>,
    immediate = false
  ): Promise<void> {
    const volumeActors = [];

    await this._isValidVolumeInputArray(
      volumeInputArray,
      this._FrameOfReferenceUID
    );

    // One actor per volume
    for (let i = 0; i < volumeInputArray.length; i++) {
      const { volumeId, visibility, actorUID } = volumeInputArray[i];
      const volumeActor = await createVolumeActor(volumeInputArray[i]);

      if (visibility === false) {
        volumeActor.setVisibility(false);
      }

      // We cannot use only volumeId since then we cannot have for instance more
      // than one representation of the same volume (since actors would have the
      // same name, and we don't allow that) AND We cannot use only any uid, since
      // we rely on the volume in the cache for mapper. So we prefer actorUID if
      // it is defined, otherwise we use volumeId for the actor name.
      const uid = actorUID || volumeId;
      volumeActors.push({ uid, volumeActor });
    }

    this.addActors(volumeActors);

    if (immediate) {
      this.render();
    }
  }

  /**
   * It removes the volume actor from the Viewport. If the volume actor is not in
   * the viewport, it does nothing.
   * @param actorUIDs - Array of actor UIDs to remove. In case of simple volume it will
   * be the volume Id, but in case of Segmentation it will be `{volumeId}-{representationType}`
   * since the same volume can be rendered in multiple representations.
   * @param immediate - If true, the Viewport will be rendered immediately
   */
  public removeVolumeActors(actorUIDs: Array<string>, immediate = false): void {
    this.removeActors(actorUIDs);

    if (immediate) {
      this.render();
    }
  }

  private async _isValidVolumeInputArray(
    volumeInputArray: Array<IVolumeInput>,
    FrameOfReferenceUID: string
  ): Promise<boolean> {
    const numVolumes = volumeInputArray.length;

    // Check all other volumes exist and have the same FrameOfReference
    for (let i = 1; i < numVolumes; i++) {
      const volumeInput = volumeInputArray[i];

      const imageVolume = await loadVolume(volumeInput.volumeId);

      if (!imageVolume) {
        throw new Error(
          `imageVolume with id: ${imageVolume.volumeId} does not exist`
        );
      }

      if (FrameOfReferenceUID !== imageVolume.metadata.FrameOfReferenceUID) {
        throw new Error(
          `Volumes being added to viewport ${this.id} do not share the same FrameOfReferenceUID. This is not yet supported`
        );
      }
    }

    return true;
  }

  /**
   * Given a point in world coordinates, return the intensity at that point
   * @param point - The point in world coordinates to get the intensity
   * from.
   * @returns The intensity value of the voxel at the given point.
   */
  public getIntensityFromWorld(point: Point3): number {
    const { volumeActor, uid } = this.getDefaultActor();
    const imageData = volumeActor.getMapper().getInputData();

    const volume = cache.getVolume(uid);
    const { dimensions } = volume;

    const index = transformWorldToIndex(imageData, point);

    const voxelIndex =
      index[2] * dimensions[0] * dimensions[1] +
      index[1] * dimensions[0] +
      index[0];

    return volume.scalarData[voxelIndex];
  }

  /**
   * gets the visible bounds of the viewport in the world coordinate system
   */
  public getBounds(): number[] {
    const renderer = this.getRenderer();
    const bounds = renderer.computeVisiblePropBounds();
    return bounds;
  }

  /**
   * Flip the viewport along the desired axis
   * @param flipDirection - FlipDirection
   */
  public flip(flipDirection: FlipDirection): void {
    super.flip(flipDirection);
  }

  /**
   * Reset the camera for the volume viewport
   * @param resetPanZoomForViewPlane - only reset Pan and Zoom, if true,
   * it renders the center of the volume instead
   * viewport to the middle of the volume
   */
  public resetCamera(resetPanZoomForViewPlane = false): boolean {
    return super.resetCamera(resetPanZoomForViewPlane);
  }

  public getFrameOfReferenceUID = (): string => {
    return this._FrameOfReferenceUID;
  };

  /**
   * Sets the slab thickness option in the `Viewport`'s `options`.
   *
   * @param slabThickness - The slab thickness to set.
   */
  public setSlabThickness(slabThickness: number): void {
    this.setCamera({
      slabThickness,
    });
  }

  /**
   * Gets the slab thickness option in the `Viewport`'s `options`.
   *
   * @returns slabThickness - The slab thickness.
   */
  public getSlabThickness(): number {
    const { slabThickness } = this.getCamera();
    return slabThickness;
  }

  /**
   * Returns the image and its properties that is being shown inside the
   * stack viewport. It returns, the image dimensions, image direction,
   * image scalar data, vtkImageData object, metadata, and scaling (e.g., PET suvbw)
   *
   * @returns IImageData: {dimensions, direction, scalarData, vtkImageData, metadata, scaling}
   */
  public getImageData(): IImageData | undefined {
    const actor = this.getDefaultActor();

    if (!actor) {
      return;
    }

    const { volumeActor } = actor;
    const vtkImageData = volumeActor.getMapper().getInputData();
    return {
      dimensions: vtkImageData.getDimensions(),
      spacing: vtkImageData.getSpacing(),
      origin: vtkImageData.getOrigin(),
      direction: vtkImageData.getDirection(),
      scalarData: vtkImageData.getPointData().getScalars().getData(),
      imageData: volumeActor.getMapper().getInputData(),
      metadata: undefined,
      scaling: undefined,
    };
  }

  /**
   * Currently only returning the flip direction of the viewport, Todo: should
   * be like StackViewport to be able to return and also set other properties
   * such as voi, invert, etc.
   *
   * @returns FlipDirection of the viewport
   */
  public getProperties = (): FlipDirection => {
    return {
      flipHorizontal: this.flipHorizontal,
      flipVertical: this.flipVertical,
    };
  };

  /**
   * Attaches the volume actors to the viewport.
   *
   * @param volumeActorEntries - The volume actors to add the viewport.
   *
   * NOTE: overwrites the slab thickness value in the options if one of the actor has a higher value
   */
  private _setVolumeActors(volumeActorEntries: Array<ActorEntry>): void {
    const renderer = this.getRenderer();

    this.setActors(volumeActorEntries);
    // volumeActorEntries.forEach((va) => renderer.addActor(va.volumeActor))

    let slabThickness = null;
    if (this.type === ViewportType.ORTHOGRAPHIC) {
      volumeActorEntries.forEach((va) => {
        if (va.slabThickness && va.slabThickness > slabThickness) {
          slabThickness = va.slabThickness;
        }
      });

      this.resetCamera();

      const activeCamera = renderer.getActiveCamera();

      // This is necessary to initialize the clipping range and it is not related
      // to our custom slabThickness.
      // activeCamera.setThicknessFromFocalPoint(0.1)
      // This is necessary to give the slab thickness.
      // NOTE: our custom camera implementation has an additional slab thickness
      // values to handle MIP and non MIP volumes in the same viewport.
      activeCamera.setSlabThickness(slabThickness);
      activeCamera.setFreezeFocalPoint(true);
    } else {
      // Use default renderer resetCamera, fits bounding sphere of data.
      renderer.resetCamera();

      const activeCamera = renderer.getActiveCamera();

      activeCamera.setFreezeFocalPoint(true);
    }
  }

  /**
   * canvasToWorld Returns the world coordinates of the given `canvasPos`
   * projected onto the plane defined by the `Viewport`'s `vtkCamera`'s focal point
   * and the direction of projection.
   *
   * @param canvasPos - The position in canvas coordinates.
   * @returns The corresponding world coordinates.
   * @public
   */
  public canvasToWorld = (canvasPos: Point2): Point3 => {
    const vtkCamera = this.getVtkActiveCamera() as vtkSlabCameraType;

    const slabThicknessActive = vtkCamera.getSlabThicknessActive();
    // NOTE: this is necessary to disable our customization of getProjectionMatrix in the vtkSlabCamera,
    // since getProjectionMatrix is used in vtk vtkRenderer.projectionToView. vtkRenderer.projectionToView is used
    // in the volumeMapper (where we need our custom getProjectionMatrix) and in the coordinates transformations
    // (where we don't need our custom getProjectionMatrix)
    // TO DO: we should customize vtk to use our custom getProjectionMatrix only in the volumeMapper
    vtkCamera.setSlabThicknessActive(false);

    const renderer = this.getRenderer();
    const offscreenMultiRenderWindow =
      this.getRenderingEngine().offscreenMultiRenderWindow;
    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const size = openGLRenderWindow.getSize();
    const displayCoord = [canvasPos[0] + this.sx, canvasPos[1] + this.sy];

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1];

    let worldCoord = openGLRenderWindow.displayToWorld(
      displayCoord[0],
      displayCoord[1],
      0,
      renderer
    );

    vtkCamera.setSlabThicknessActive(slabThicknessActive);

    worldCoord = this.applyFlipTx(worldCoord);
    return worldCoord;
  };

  /**
   * Returns the canvas coordinates of the given `worldPos`
   * projected onto the `Viewport`'s `canvas`.
   *
   * @param worldPos - The position in world coordinates.
   * @returns The corresponding canvas coordinates.
   * @public
   */
  public worldToCanvas = (worldPos: Point3): Point2 => {
    const vtkCamera = this.getVtkActiveCamera() as vtkSlabCameraType;

    const slabThicknessActive = vtkCamera.getSlabThicknessActive();
    // NOTE: this is necessary to disable our customization of getProjectionMatrix in the vtkSlabCamera,
    // since getProjectionMatrix is used in vtk vtkRenderer.projectionToView. vtkRenderer.projectionToView is used
    // in the volumeMapper (where we need our custom getProjectionMatrix) and in the coordinates transformations
    // (where we don't need our custom getProjectionMatrix)
    // TO DO: we should customize vtk to use our custom getProjectionMatrix only in the volumeMapper
    vtkCamera.setSlabThicknessActive(false);

    const renderer = this.getRenderer();
    const offscreenMultiRenderWindow =
      this.getRenderingEngine().offscreenMultiRenderWindow;
    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const size = openGLRenderWindow.getSize();
    const displayCoord = openGLRenderWindow.worldToDisplay(
      ...this.applyFlipTx(worldPos),
      renderer
    );

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1];

    const canvasCoord = <Point2>[
      displayCoord[0] - this.sx,
      displayCoord[1] - this.sy,
    ];

    vtkCamera.setSlabThicknessActive(slabThicknessActive);

    return canvasCoord;
  };

  /**
   * Uses viewport camera and volume actor to decide if the viewport
   * is looking at the volume in the direction of acquisition (imageIds).
   * If so, it uses the origin and focalPoint to calculate the slice index.
   * Todo: This only works if the imageIds are properly sorted
   *
   * @returns The slice index
   */
  public getCurrentImageIdIndex = (): number | undefined => {
    return this._getImageIdIndex();
  };

  /**
   * Uses viewport camera and volume actor to decide if the viewport
   * is looking at the volume in the direction of acquisition (imageIds).
   * If so, it uses the origin and focalPoint to find which imageId is
   * currently being viewed.
   *
   * @returns ImageId
   */
  public getCurrentImageId = (): string | undefined => {
    const index = this._getImageIdIndex();

    if (!index) {
      return;
    }

    const { uid } = this.getDefaultActor();
    const volume = cache.getVolume(uid);

    if (!volume) {
      return;
    }

    const imageIds = volume.imageIds;

    return imageIds[index];
  };

  private _getImageIdIndex = () => {
    const { viewPlaneNormal, focalPoint } = this.getCamera();

    // Todo: handle scenario of fusion of multiple volumes
    // we cannot only check number of actors, because we might have
    // segmentations ...
    const { direction, origin, spacing } = this.getImageData();

    // get the last 3 components of the direction - axis normal
    const dir = direction.slice(direction.length - 3);

    const dot = Math.abs(
      dir[0] * viewPlaneNormal[0] +
        dir[1] * viewPlaneNormal[1] +
        dir[2] * viewPlaneNormal[2]
    );

    // if dot is not 1 or -1 return null since it means
    // viewport is not looking at the image acquisition plane
    if (dot - 1 > EPSILON) {
      return;
    }

    // how many steps are from the origin to the focal point in the
    // normal direction
    const spacingInNormal = spacing[2];
    const sub = vec3.create();
    vec3.sub(sub, focalPoint, origin);
    const distance = vec3.dot(sub, viewPlaneNormal);

    // divide by the spacing in the normal direction to get the
    // number of steps, and subtract 1 to get the index
    return Math.round(Math.abs(distance) / spacingInNormal);
  };
}

export default VolumeViewport;
