import React from 'react';
import { useIsGlassesViewport } from '../util/viewport.js';

/***
 * MARK: GlassesViewportGate
 * @description Renders its glasses content only on a Meta Ray-Ban shaped
 *   viewport (~600x600 square), otherwise its normal children — so call
 *   sites swap one subtree in one line while desktop and mobile render
 *   exactly as before. The viewport predicate is the only switch; there is
 *   no runtime flag to drift between builds.
 * @example <GlassesViewportGate glasses={<GlassesTaskListView {...props} />}><WorkflowCanvas /></GlassesViewportGate>
 * @param {Object} props
 * @param {React.ReactNode} [props.glasses] - Glasses-only content.
 * @param {React.ReactNode} [props.children] - Normal desktop/mobile content.
 ***/
export function GlassesViewportGate({ glasses = null, children = null }) {
  const isGlasses = useIsGlassesViewport();
  // Fragment-wrapped so multi-child call sites never hit array key warnings.
  if (isGlasses) return <>{glasses}</>;
  return <>{children}</>;
}
