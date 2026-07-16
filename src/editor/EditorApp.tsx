import { Player } from '@remotion/player';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Scene, SlideshowManifest } from '../schemas/manifest';
import { Slideshow } from '../remotion/compositions/Slideshow';
import { mediaFrameRect, type FrameRect } from '../remotion/layouts';
import { applyManualEdits, type ManualEdits, type PhotoFramingEdit } from './manual-edits';

type EditorPayload = {
  projectName: string;
  editsFileName: string;
  manifest: SlideshowManifest;
  edits: ManualEdits;
};

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

type DragState = {
  pointerId: number;
  sceneId: string;
  assetId: string;
  kind: 'content' | 'frame' | 'resize';
  corner?: ResizeCorner;
  clientX: number;
  clientY: number;
  stageWidth: number;
  stageHeight: number;
  frame: FrameRect;
  focus: { x: number; y: number };
  contentScale: number;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

const resizeFrame = (
  frame: FrameRect,
  corner: ResizeCorner,
  deltaX: number,
  deltaY: number,
): FrameRect => {
  let left = frame.x;
  let top = frame.y;
  let right = frame.x + frame.width;
  let bottom = frame.y + frame.height;
  if (corner.includes('w')) left = clamp(left + deltaX, 0, right - 0.08);
  if (corner.includes('e')) right = clamp(right + deltaX, left + 0.08, 1);
  if (corner.includes('n')) top = clamp(top + deltaY, 0, bottom - 0.08);
  if (corner.includes('s')) bottom = clamp(bottom + deltaY, top + 0.08, 1);
  return {
    x: round(left),
    y: round(top),
    width: round(right - left),
    height: round(bottom - top),
  };
};

const isolatedManifest = (manifest: SlideshowManifest, scene: Scene): SlideshowManifest => {
  const sceneWithoutTransition = { ...scene };
  delete sceneWithoutTransition.transitionOut;
  return {
    ...manifest,
    targetFrames: scene.durationInFrames,
    totalFrames: scene.durationInFrames,
    scenes: [
      {
        ...sceneWithoutTransition,
        startFrame: 0,
        endFrame: scene.durationInFrames,
      },
    ],
    audio: [],
  };
};

export const EditorApp: React.FC = () => {
  const [payload, setPayload] = useState<EditorPayload | null>(null);
  const [edits, setEdits] = useState<ManualEdits | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const [loadError, setLoadError] = useState('');
  const [drag, setDrag] = useState<DragState | null>(null);
  const revisionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/editor')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Falha ao carregar editor (${response.status}).`);
        return (await response.json()) as EditorPayload;
      })
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        setEdits(data.edits);
        const firstScene = data.manifest.scenes[0];
        setSelectedSceneId(firstScene?.id ?? '');
        setSelectedAssetId(firstScene?.photos[0]?.assetId ?? '');
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!edits || saveStatus !== 'pending') return;
    const revision = revisionRef.current;
    const timeout = window.setTimeout(() => {
      setSaveStatus('saving');
      fetch('/api/edits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits),
      })
        .then(async (response) => {
          if (!response.ok) {
            const result = (await response.json()) as { error?: string };
            throw new Error(result.error ?? `Falha ao salvar (${response.status}).`);
          }
          if (revisionRef.current === revision) setSaveStatus('saved');
        })
        .catch(() => setSaveStatus('error'));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [edits, saveStatus]);

  const manifest = useMemo(
    () =>
      payload && edits ? applyManualEdits(payload.manifest, edits) : (payload?.manifest ?? null),
    [edits, payload],
  );
  const assetMap = useMemo(
    () => new Map(manifest?.assets.map((asset) => [asset.id, asset]) ?? []),
    [manifest?.assets],
  );
  const currentScene = useMemo(
    () => manifest?.scenes.find((scene) => scene.id === selectedSceneId) ?? null,
    [manifest?.scenes, selectedSceneId],
  );
  const previewManifest = useMemo(
    () => (manifest && currentScene ? isolatedManifest(manifest, currentScene) : null),
    [currentScene, manifest],
  );
  const selectedPhoto =
    currentScene?.photos.find((photo) => photo.assetId === selectedAssetId) ?? null;
  const selectedAsset = selectedPhoto ? assetMap.get(selectedPhoto.assetId) : undefined;
  const selectedPhotoEdit =
    edits && currentScene ? edits.scenes[currentScene.id]?.photos[selectedAssetId] : undefined;

  const changeEdits = useCallback((updater: (current: ManualEdits) => ManualEdits) => {
    revisionRef.current += 1;
    setSaveStatus('pending');
    setEdits((current) => (current ? updater(current) : current));
  }, []);

  const updatePhotoEdit = useCallback(
    (scene: Scene, assetId: string, patch: Partial<PhotoFramingEdit>) => {
      changeEdits((current) => {
        const sceneEdit = current.scenes[scene.id] ?? {
          sceneType: scene.type,
          assetIds: scene.photos.map((photo) => photo.assetId),
          photos: {},
        };
        return {
          ...current,
          scenes: {
            ...current.scenes,
            [scene.id]: {
              ...sceneEdit,
              sceneType: scene.type,
              assetIds: scene.photos.map((photo) => photo.assetId),
              photos: {
                ...sceneEdit.photos,
                [assetId]: { ...sceneEdit.photos[assetId], ...patch },
              },
            },
          },
        };
      });
    },
    [changeEdits],
  );

  const resetPhoto = useCallback(() => {
    if (!currentScene || !selectedAssetId) return;
    changeEdits((current) => {
      const sceneEdit = current.scenes[currentScene.id];
      if (!sceneEdit?.photos[selectedAssetId]) return current;
      const photos = { ...sceneEdit.photos };
      delete photos[selectedAssetId];
      const scenes = { ...current.scenes };
      if (Object.keys(photos).length === 0) {
        delete scenes[currentScene.id];
      } else {
        scenes[currentScene.id] = { ...sceneEdit, photos };
      }
      return { ...current, scenes };
    });
  }, [changeEdits, currentScene, selectedAssetId]);

  const selectScene = useCallback((scene: Scene) => {
    setSelectedSceneId(scene.id);
    setSelectedAssetId(scene.photos[0]?.assetId ?? '');
  }, []);

  const beginDrag = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      scene: Scene,
      assetId: string,
      frame: FrameRect,
      kind: DragState['kind'],
      corner?: ResizeCorner,
    ) => {
      const stage = event.currentTarget.closest('.stage')?.getBoundingClientRect();
      const photo = scene.photos.find((candidate) => candidate.assetId === assetId);
      if (!stage || !photo) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelectedAssetId(assetId);
      setDrag({
        pointerId: event.pointerId,
        sceneId: scene.id,
        assetId,
        kind: event.shiftKey && kind === 'content' ? 'frame' : kind,
        ...(corner ? { corner } : {}),
        clientX: event.clientX,
        clientY: event.clientY,
        stageWidth: stage.width,
        stageHeight: stage.height,
        frame,
        focus: photo.focus,
        contentScale: photo.contentScale ?? 1,
      });
    },
    [],
  );

  const continueDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!drag || drag.pointerId !== event.pointerId || !currentScene) return;
      event.preventDefault();
      const deltaX = (event.clientX - drag.clientX) / drag.stageWidth;
      const deltaY = (event.clientY - drag.clientY) / drag.stageHeight;
      if (drag.kind === 'content') {
        updatePhotoEdit(currentScene, drag.assetId, {
          focus: {
            x: round(
              clamp(
                drag.focus.x - deltaX / Math.max(0.08, drag.frame.width * drag.contentScale),
                0,
                1,
              ),
            ),
            y: round(
              clamp(
                drag.focus.y - deltaY / Math.max(0.08, drag.frame.height * drag.contentScale),
                0,
                1,
              ),
            ),
          },
        });
        return;
      }
      if (drag.kind === 'frame') {
        updatePhotoEdit(currentScene, drag.assetId, {
          frame: {
            ...drag.frame,
            x: round(clamp(drag.frame.x + deltaX, 0, 1 - drag.frame.width)),
            y: round(clamp(drag.frame.y + deltaY, 0, 1 - drag.frame.height)),
          },
        });
        return;
      }
      if (drag.corner) {
        updatePhotoEdit(currentScene, drag.assetId, {
          frame: resizeFrame(drag.frame, drag.corner, deltaX, deltaY),
        });
      }
    },
    [currentScene, drag, updatePhotoEdit],
  );

  const endDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    setDrag((current) => (current?.pointerId === event.pointerId ? null : current));
  }, []);

  if (loadError) {
    return <main className="center-message">Erro ao abrir o editor: {loadError}</main>;
  }
  if (!payload || !edits || !manifest || !currentScene || !previewManifest) {
    return <main className="center-message">Preparando o Framing Editor…</main>;
  }

  return (
    <main className="editor-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Slideshow</span>
          <h1>Framing Editor</h1>
        </div>
        <div className={`save-state save-${saveStatus}`}>
          <span />
          {saveStatus === 'saved'
            ? `Salvo em ${payload.editsFileName}`
            : saveStatus === 'saving'
              ? 'Salvando…'
              : saveStatus === 'error'
                ? 'Erro ao salvar'
                : 'Alterações pendentes'}
        </div>
      </header>

      <section className="workspace">
        <aside className="scene-list">
          <div className="panel-heading">
            <strong>Cenas</strong>
            <span>{manifest.scenes.length}</span>
          </div>
          <div className="scene-scroll">
            {manifest.scenes.map((scene, index) => {
              const changed = Boolean(edits.scenes[scene.id]);
              const label =
                scene.type === 'intro'
                  ? 'Abertura'
                  : scene.type === 'outro'
                    ? 'Encerramento'
                    : scene.dateLabel || scene.caption || `Cena ${index + 1}`;
              return (
                <button
                  className={`scene-button ${scene.id === currentScene.id ? 'active' : ''}`}
                  key={scene.id}
                  onClick={() => selectScene(scene)}
                  type="button"
                >
                  <span className="scene-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="scene-copy">
                    <strong>{label}</strong>
                    <small>{scene.photos.length} foto(s)</small>
                  </span>
                  {changed ? <i title="Cena ajustada" /> : null}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="preview-column">
          <div className="preview-toolbar">
            <div>
              <strong>{currentScene.dateLabel ?? currentScene.title ?? currentScene.id}</strong>
              <span>{currentScene.layout}</span>
            </div>
            <p>
              Arraste a foto para enquadrar. <kbd>Shift</kbd> + arraste move o frame.
            </p>
          </div>
          <div className="stage" style={{ aspectRatio: `${manifest.width} / ${manifest.height}` }}>
            <Player
              key={currentScene.id}
              component={Slideshow}
              inputProps={previewManifest}
              durationInFrames={currentScene.durationInFrames}
              compositionWidth={manifest.width}
              compositionHeight={manifest.height}
              fps={manifest.fps}
              controls
              loop
              initialFrame={Math.min(
                currentScene.durationInFrames - 1,
                Math.round(manifest.fps * 1.15),
              )}
              acknowledgeRemotionLicense
              style={{ width: '100%', height: '100%' }}
            />
            <div className="frame-overlays">
              {currentScene.photos.map((photo, index) => {
                const rect = mediaFrameRect(
                  currentScene.layout,
                  currentScene.photos.length,
                  index,
                  photo.frame,
                );
                const selected = photo.assetId === selectedAssetId;
                return (
                  <div
                    className={`frame-overlay ${selected ? 'selected' : ''}`}
                    key={photo.assetId}
                    style={{
                      left: `${rect.x * 100}%`,
                      top: `${rect.y * 100}%`,
                      width: `${rect.width * 100}%`,
                      height: `${rect.height * 100}%`,
                    }}
                    onPointerDown={(event) =>
                      beginDrag(event, currentScene, photo.assetId, rect, 'content')
                    }
                    onPointerMove={continueDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    <span className="frame-name">
                      {assetMap.get(photo.assetId)?.fileName ?? photo.assetId}
                    </span>
                    {selected
                      ? (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                          <button
                            aria-label={`Redimensionar ${corner}`}
                            className={`resize-handle handle-${corner}`}
                            key={corner}
                            onPointerDown={(event) =>
                              beginDrag(event, currentScene, photo.assetId, rect, 'resize', corner)
                            }
                            onPointerMove={continueDrag}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            type="button"
                          />
                        ))
                      : null}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="photo-tabs">
            {currentScene.photos.map((photo, index) => {
              const asset = assetMap.get(photo.assetId);
              const changed = Boolean(edits.scenes[currentScene.id]?.photos[photo.assetId]);
              return (
                <button
                  className={photo.assetId === selectedAssetId ? 'active' : ''}
                  key={photo.assetId}
                  onClick={() => setSelectedAssetId(photo.assetId)}
                  type="button"
                >
                  <span>{index + 1}</span>
                  {asset?.fileName ?? photo.assetId}
                  {changed ? <i /> : null}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="controls-panel">
          <div className="panel-heading">
            <strong>Enquadramento</strong>
            {selectedPhotoEdit ? <span>Ajustado</span> : <span>Automático</span>}
          </div>
          {selectedPhoto && selectedAsset ? (
            <div className="controls-scroll">
              <div className="selected-file">
                <span>Foto selecionada</span>
                <strong>{selectedAsset.fileName}</strong>
              </div>

              <div className="control-group">
                <label htmlFor="zoom">
                  <span>Zoom</span>
                  <output>{(selectedPhoto.contentScale ?? 1).toFixed(2)}×</output>
                </label>
                <input
                  id="zoom"
                  max="4"
                  min="0.5"
                  step="0.01"
                  type="range"
                  value={selectedPhoto.contentScale ?? 1}
                  onChange={(event) =>
                    updatePhotoEdit(currentScene, selectedPhoto.assetId, {
                      contentScale: Number(event.currentTarget.value),
                    })
                  }
                />
              </div>

              <div className="control-group">
                <span className="control-label">Preenchimento</span>
                <div className="segmented">
                  {(['contain', 'cover'] as const).map((fit) => (
                    <button
                      className={(selectedPhoto.fit ?? 'contain') === fit ? 'active' : ''}
                      key={fit}
                      onClick={() => updatePhotoEdit(currentScene, selectedPhoto.assetId, { fit })}
                      type="button"
                    >
                      {fit === 'contain' ? 'Foto inteira' : 'Preencher frame'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-group">
                <label htmlFor="rotation">
                  <span>Rotação</span>
                  <output>{selectedPhoto.rotation.toFixed(1)}°</output>
                </label>
                <input
                  id="rotation"
                  max="15"
                  min="-15"
                  step="0.1"
                  type="range"
                  value={selectedPhoto.rotation}
                  onChange={(event) =>
                    updatePhotoEdit(currentScene, selectedPhoto.assetId, {
                      rotation: Number(event.currentTarget.value),
                    })
                  }
                />
              </div>

              <div className="coordinate-grid">
                <div>
                  <span>Foco X</span>
                  <strong>{Math.round(selectedPhoto.focus.x * 100)}%</strong>
                </div>
                <div>
                  <span>Foco Y</span>
                  <strong>{Math.round(selectedPhoto.focus.y * 100)}%</strong>
                </div>
                <div>
                  <span>Frame</span>
                  <strong>{selectedPhoto.frame ? 'Manual' : 'Auto'}</strong>
                </div>
                <div>
                  <span>Modo</span>
                  <strong>{selectedPhoto.fit === 'cover' ? 'Cover' : 'Contain'}</strong>
                </div>
              </div>

              <div className="help-card">
                <strong>Como ajustar</strong>
                <p>Arraste sobre a foto para escolher quem deve permanecer em destaque.</p>
                <p>
                  Segure <kbd>Shift</kbd> ao arrastar para mover o box. Use os cantos para
                  redimensioná-lo.
                </p>
              </div>

              <button className="reset-button" onClick={resetPhoto} type="button">
                Restaurar enquadramento automático
              </button>
            </div>
          ) : (
            <p className="empty-selection">Esta cena não possui mídia editável.</p>
          )}
        </aside>
      </section>
    </main>
  );
};
