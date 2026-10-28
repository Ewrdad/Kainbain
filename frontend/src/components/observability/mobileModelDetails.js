import { formatModelRef } from '../../services/formatModelRef';
import { isAutomatedStage } from '../stageTypes';

/***
 * MARK: resolveMobileModelDetails
 * @description Pure resolver for the mobile monitor header's model details
 *   row. Mirrors the pill logic of ActiveTaskPromptWidget (the main monitor
 *   view's authoritative model display) so the two can never drift apart:
 *   fully scripted stages (`ci`/`deploy`/`merge`) show an `Automated — no
 *   model` pill instead of harness/model; harness-managed stages
 *   (`modelSelection: "none"`) show only the Harness pill; agent stages show
 *   Harness + Model pills with a Provider/Source sub-line when known. A
 *   missing `modelSelection` means `"list"`. The backend `isAutomatedStage`
 *   flag wins when present; the local stage-type predicate covers older
 *   backends. Unknown stage types stay fail-visible (pills shown). With no
 *   active task the row renders the idle fallback instead of blanking.
 * @param {Object|null} [activeTask] - Resolved active task (model, harness, modelDetails, modelSelection, stageType).
 * @param {Object} [engineState] - Engine snapshot (activeStageType fallback).
 * @returns {{model: {harness: string|null, provider: string|null, id: string|null, label: string}, modelRef: string|null, harness: string, provider: string|null, source: string|null, modelSelection: string, stageType: string|undefined, isScripted: boolean, isIdle: boolean, showHarness: boolean, showModel: boolean, showProviderLine: boolean, showAlias: boolean, aliasName: string|null, aliasMissing: string|null, aliasTitle: string|undefined}}
 * @example resolveMobileModelDetails({ model: 'pi::pi::qwen3:8b', harness: 'pi' }, {}).showModel // true
 ***/
export function resolveMobileModelDetails(activeTask = null, engineState = {}) {
  const hasTask =
    !!activeTask && (typeof activeTask !== 'object' || Object.keys(activeTask).length > 0);
  const modelRef = activeTask?.modelDetails?.key || activeTask?.model || null;
  const model = formatModelRef(modelRef);
  const harness = activeTask?.harness || model.harness || 'Unknown';
  const provider = activeTask?.modelDetails?.provider || model.provider || null;
  const source = activeTask?.modelDetails?.source || null;
  const modelSelection = activeTask?.modelSelection || 'list';
  const stageType =
    activeTask?.stageType || activeTask?.currentStageType || engineState?.activeStageType;
  // Scripted stages run no model: the backend flag is authoritative when
  // present; the local predicate covers older backends without the flag.
  const isScripted =
    typeof activeTask?.isAutomatedStage === 'boolean'
      ? activeTask.isAutomatedStage
      : isAutomatedStage(stageType);
  const isIdle = !hasTask;
  const showHarness = !isScripted && !isIdle;
  const showModel = !isScripted && !isIdle && modelSelection !== 'none';
  const showProviderLine = showModel && (!!provider || !!source);
  // The alias behind the run (resolved) or the unresolvable ref (missing);
  // both hide on scripted stages and stay absent on old payloads.
  const aliasName = activeTask?.alias?.name || null;
  const aliasMissing = !aliasName ? activeTask?.aliasMissing || null : null;
  const showAlias = !isScripted && !isIdle && !!(aliasName || aliasMissing);
  const aliasTitle =
    aliasName && typeof activeTask?.alias?.targetIndex === 'number'
      ? `alias ${aliasName}, target ${activeTask.alias.targetIndex + 1}`
      : undefined;

  return {
    model,
    modelRef,
    harness,
    provider,
    source,
    modelSelection,
    stageType,
    isScripted,
    isIdle,
    showHarness,
    showModel,
    showProviderLine,
    showAlias,
    aliasName,
    aliasMissing,
    aliasTitle,
  };
}

export default resolveMobileModelDetails;
