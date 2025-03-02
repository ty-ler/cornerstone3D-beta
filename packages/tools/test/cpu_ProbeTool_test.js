import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const {
  cache,
  RenderingEngine,
  utilities,
  eventTarget,
  imageLoader,
  metaData,
  Enums,
  volumeLoader,
  setUseCPURendering,
  resetUseCPURendering,
  CONSTANTS,
} = cornerstone3D;

const { Events, ViewportType } = Enums;
const { ORIENTATION } = CONSTANTS;

const {
  ProbeTool,
  ToolGroupManager,
  cancelActiveManipulations,
  annotation,
  Enums: csToolsEnums,
} = csTools3d;

const { Events: csToolsEvents } = csToolsEnums;

const {
  fakeImageLoader,
  fakeMetaDataProvider,
  fakeVolumeLoader,
  createNormalizedMouseEvent,
} = testUtils;

const renderingEngineId = utilities.uuidv4();

const viewportId = 'VIEWPORT';

const AXIAL = 'AXIAL';

const volumeId = `fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0`;

function createViewport(renderingEngine, viewportType, width, height) {
  const element = document.createElement('div');

  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  document.body.appendChild(element);

  renderingEngine.setViewports([
    {
      viewportId: viewportId,
      type: viewportType,
      element,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
        orientation: ORIENTATION[AXIAL],
      },
    },
  ]);
  return element;
}

describe('ProbeTool (CPU):', () => {
  beforeAll(() => {
    setUseCPURendering(true);
  });

  afterAll(() => {
    resetUseCPURendering();
  });

  beforeEach(function () {
    csTools3d.init();
    csTools3d.addTool(ProbeTool);
    cache.purgeCache();
    this.DOMElements = [];

    this.stackToolGroup = ToolGroupManager.createToolGroup('stack');
    this.stackToolGroup.addTool(ProbeTool.toolName, {
      configuration: { volumeId: volumeId }, // Only for volume viewport
    });
    this.stackToolGroup.setToolActive(ProbeTool.toolName, {
      bindings: [{ mouseButton: 1 }],
    });

    this.renderingEngine = new RenderingEngine(renderingEngineId);
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    volumeLoader.registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
  });

  afterEach(function () {
    csTools3d.destroy();
    eventTarget.reset();
    cache.purgeCache();

    this.renderingEngine.destroy();
    metaData.removeProvider(fakeMetaDataProvider);
    imageLoader.unregisterAllImageLoaders();
    ToolGroupManager.destroyToolGroup('stack');

    this.DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  });

  it('Should successfully click to put a probe tool on a cpu stack viewport - 512 x 128', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      512,
      128
    );
    this.DOMElements.push(element);

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        // Can successfully add probe tool to annotationManager
        const probeAnnotations = annotation.state.getAnnotations(
          element,
          ProbeTool.toolName
        );
        expect(probeAnnotations).toBeDefined();
        expect(probeAnnotations.length).toBe(1);

        const probeAnnotation = probeAnnotations[0];
        expect(probeAnnotation.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        );
        expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName);
        expect(probeAnnotation.invalidated).toBe(false);

        const data = probeAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        // The world coordinate is on the white bar so value is 255
        expect(data[targets[0]].value).toBe(255);

        annotation.state.removeAnnotation(
          element,
          probeAnnotation.annotationUID
        );
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 20, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      });
      element.dispatchEvent(evt);

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');

      // Since there is tool rendering happening for any mouse event
      // we just attach a listener before the last one -> mouse up
      addEventListenerForAnnotationRendered();
      document.dispatchEvent(evt);
    });

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      vp.setStack([imageId1], 0);
      vp.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully click to put two probe tools on a cpu stack viewport - 256 x 256', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      256,
      256
    );
    this.DOMElements.push(element);

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        // Can successfully add probe tool to annotationManager
        const probeAnnotations = annotation.state.getAnnotations(
          element,
          ProbeTool.toolName
        );
        expect(probeAnnotations).toBeDefined();
        expect(probeAnnotations.length).toBe(2);

        const firstProbeAnnotation = probeAnnotations[0];
        expect(firstProbeAnnotation.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        );
        expect(firstProbeAnnotation.metadata.toolName).toBe(ProbeTool.toolName);
        expect(firstProbeAnnotation.invalidated).toBe(false);

        let data = firstProbeAnnotation.data.cachedStats;
        let targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        // The world coordinate is on the white bar so value is 255
        expect(data[targets[0]].value).toBe(255);

        // Second click
        const secondProbeAnnotation = probeAnnotations[1];
        expect(secondProbeAnnotation.metadata.toolName).toBe(
          ProbeTool.toolName
        );
        expect(secondProbeAnnotation.invalidated).toBe(false);

        data = secondProbeAnnotation.data.cachedStats;
        targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        // The world coordinate is on the white bar so value is 255
        expect(data[targets[0]].value).toBe(0);

        //
        annotation.state.removeAnnotation(
          element,
          firstProbeAnnotation.annotationUID
        );
        annotation.state.removeAnnotation(
          element,
          secondProbeAnnotation.annotationUID
        );

        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 20, 0]; // 255
      const index2 = [20, 20, 0]; // 0

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp);

      // Mouse Down
      let evt1 = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      });
      element.dispatchEvent(evt1);

      // Mouse Up instantly after
      evt1 = new MouseEvent('mouseup');
      document.dispatchEvent(evt1);

      // Mouse Down
      let evt2 = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
      });
      element.dispatchEvent(evt2);

      // Mouse Up instantly after
      evt2 = new MouseEvent('mouseup');

      addEventListenerForAnnotationRendered();
      document.dispatchEvent(evt2);
    });

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      vp.setStack([imageId1], 0);
      vp.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully click to put a probe tool on a cpu stack viewport - 256 x 512', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      256,
      512
    );
    this.DOMElements.push(element);

    const imageId1 = 'fakeImageLoader:imageURI_256_256_100_100_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        // Can successfully add probe tool to annotationManager
        const probeAnnotations = annotation.state.getAnnotations(
          element,
          ProbeTool.toolName
        );
        expect(probeAnnotations).toBeDefined();
        expect(probeAnnotations.length).toBe(1);

        const probeAnnotation = probeAnnotations[0];
        expect(probeAnnotation.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        );
        expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName);
        expect(probeAnnotation.invalidated).toBe(false);

        const data = probeAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        // The world coordinate is on the white bar so value is 255
        expect(data[targets[0]].value).toBe(255);

        annotation.state.removeAnnotation(
          element,
          probeAnnotation.annotationUID
        );
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [150, 100, 0]; // 255

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      });
      element.dispatchEvent(evt);

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');

      addEventListenerForAnnotationRendered();
      document.dispatchEvent(evt);
    });

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      vp.setStack([imageId1], 0);
      vp.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully click to put a probe tool on a cpu stack viewport - 256 x 512', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      256,
      512
    );
    this.DOMElements.push(element);

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        // Can successfully add probe tool to annotationManager
        const probeAnnotations = annotation.state.getAnnotations(
          element,
          ProbeTool.toolName
        );
        expect(probeAnnotations).toBeDefined();
        expect(probeAnnotations.length).toBe(1);

        const probeAnnotation = probeAnnotations[0];
        expect(probeAnnotation.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        );
        expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName);
        expect(probeAnnotation.invalidated).toBe(false);

        const data = probeAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        // The world coordinate is on the white bar so value is 255
        expect(data[targets[0]].value).toBe(0);

        annotation.state.removeAnnotation(
          element,
          probeAnnotation.annotationUID
        );
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [35, 35, 0]; // 0

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      });
      element.dispatchEvent(evt);

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');

      addEventListenerForAnnotationRendered();
      document.dispatchEvent(evt);
    });

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      vp.setStack([imageId1], 0);
      vp.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a Probe tool on a cpu stack viewport and select AND move it', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      256,
      256
    );
    this.DOMElements.push(element);

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportId);

    let p2;

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const probeAnnotations = annotation.state.getAnnotations(
          element,
          ProbeTool.toolName
        );
        // Can successfully add Length tool to annotationManager
        expect(probeAnnotations).toBeDefined();
        expect(probeAnnotations.length).toBe(1);

        const probeAnnotation = probeAnnotations[0];
        expect(probeAnnotation.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        );
        expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName);
        expect(probeAnnotation.invalidated).toBe(false);

        const data = probeAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        // We expect the probeTool which was original on 255 strip should be 0 now
        expect(data[targets[0]].value).toBe(0);

        const handles = probeAnnotation.data.handles.points;

        expect(handles[0][0]).toEqual(p2[0]);
        expect(handles[0][1]).toEqual(p2[1]);
        expect(handles[0][2]).toEqual(p2[2]);

        annotation.state.removeAnnotation(
          element,
          probeAnnotation.annotationUID
        );
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 20, 0]; // 255
      const index2 = [40, 40, 0]; // 0

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp);
      p2 = worldCoord2;

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      element.dispatchEvent(evt);

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');
      document.dispatchEvent(evt);

      // Grab the probe tool again
      evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      element.dispatchEvent(evt);

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });
      document.dispatchEvent(evt);

      evt = new MouseEvent('mouseup');

      addEventListenerForAnnotationRendered();
      document.dispatchEvent(evt);
    });

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      vp.setStack([imageId1], 0);
      vp.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully cancel drawing of a ProbeTool on a cpu stack viewport', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      256,
      256
    );
    this.DOMElements.push(element);

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportId);

    let p2;

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 20, 0]; // 255
      const index2 = [40, 40, 0]; // 0

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp);
      p2 = worldCoord2;

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      element.dispatchEvent(evt);

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });
      document.dispatchEvent(evt);

      // Cancel the drawing
      let e = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Esc',
        char: 'Esc',
      });
      element.dispatchEvent(e);

      e = new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(e);
    });

    const cancelToolDrawing = () => {
      const canceledDataUID = cancelActiveManipulations(element);
      expect(canceledDataUID).toBeDefined();

      setTimeout(() => {
        const probeAnnotations = annotation.state.getAnnotations(
          element,
          ProbeTool.toolName
        );
        // Can successfully add Length tool to annotationManager
        expect(probeAnnotations).toBeDefined();
        expect(probeAnnotations.length).toBe(1);

        const probeAnnotation = probeAnnotations[0];
        expect(probeAnnotation.metadata.referencedImageId).toBe(
          imageId1.split(':')[1]
        );
        expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName);
        expect(probeAnnotation.invalidated).toBe(false);
        expect(probeAnnotation.highlighted).toBe(false);

        const data = probeAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        // We expect the probeTool which was original on 255 strip should be 0 now
        expect(data[targets[0]].value).toBe(0);

        const handles = probeAnnotation.data.handles.points;

        expect(handles[0][0]).toEqual(p2[0]);
        expect(handles[0][1]).toEqual(p2[1]);
        expect(handles[0][2]).toEqual(p2[2]);

        annotation.state.removeAnnotation(
          element,
          probeAnnotation.annotationUID
        );
        done();
      }, 100);
    };

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);
    element.addEventListener(csToolsEvents.KEY_DOWN, cancelToolDrawing);

    try {
      vp.setStack([imageId1], 0);
      vp.render();
    } catch (e) {
      done.fail(e);
    }
  });
});
