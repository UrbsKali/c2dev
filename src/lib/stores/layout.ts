import { onDestroy } from 'svelte';
import { readable } from 'svelte/store';

interface ScreenDetails {
  screens: Screen[];
  currentScreen: Screen;
  addEventListener(type: 'screenschange' | 'currentscreenchange', listener: () => void, options?: AddEventListenerOptions): void;
  removeEventListener(type: 'screenschange' | 'currentscreenchange', listener: () => void, options?: EventListenerOptions): void;
}

export interface LayoutState {
  viewportHeight: number;
  viewportWidth: number;
  viewportOffsetTop: number;
  viewportOffsetLeft: number;
  scale: number;
  devicePixelRatio: number;
  screenCount: number;
  isMultiScreen: boolean;
}

const DEFAULT_STATE: LayoutState = {
  viewportHeight: 0,
  viewportWidth: 0,
  viewportOffsetTop: 0,
  viewportOffsetLeft: 0,
  scale: 1,
  devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
  screenCount: 1,
  isMultiScreen: false
};

function startLayoutObserver(set: (value: LayoutState) => void): () => void {
  if (typeof window === 'undefined') {
    set(DEFAULT_STATE);
    return () => undefined;
  }

  const abortController = new AbortController();
  const applyViewport = (): void => {
    const vv = window.visualViewport;
    set({
      viewportHeight: vv?.height ?? window.innerHeight,
      viewportWidth: vv?.width ?? window.innerWidth,
      viewportOffsetTop: vv?.offsetTop ?? 0,
      viewportOffsetLeft: vv?.offsetLeft ?? 0,
      scale: vv?.scale ?? 1,
      devicePixelRatio: window.devicePixelRatio,
      screenCount: screenDetails?.screens.length ?? 1,
      isMultiScreen: Boolean(screenDetails && screenDetails.screens.length > 1)
    });
  };

  let screenDetails: ScreenDetails | null = null;

  const hookVisualViewport = (): void => {
    const vv = window.visualViewport;
    if (!vv) return;
    vv.addEventListener('resize', applyViewport, { signal: abortController.signal });
    vv.addEventListener('scroll', applyViewport, { signal: abortController.signal });
  };

  const hookScreenDetails = async (): Promise<void> => {
    if (!('getScreenDetails' in window)) {
      applyViewport();
      return;
    }
    try {
      screenDetails = await (window as unknown as { getScreenDetails: () => Promise<ScreenDetails> }).getScreenDetails();
      screenDetails.addEventListener('screenschange', applyViewport, { signal: abortController.signal });
      screenDetails.addEventListener('currentscreenchange', applyViewport, { signal: abortController.signal });
    } catch (error) {
      console.warn('[Layout] Failed to acquire screen details', error);
    } finally {
      applyViewport();
    }
  };

  hookVisualViewport();
  void hookScreenDetails();
  applyViewport();

  return () => abortController.abort();
}

export const layoutState = readable<LayoutState>(DEFAULT_STATE, (set) => startLayoutObserver(set));

export function useLayoutObserver(): LayoutState {
  let state = DEFAULT_STATE;
  const unsubscribe = layoutState.subscribe((value) => {
    state = value;
  });
  onDestroy(unsubscribe);
  return state;
}
