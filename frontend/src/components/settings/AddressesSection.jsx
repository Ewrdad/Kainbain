import { AppLinkSection } from './AppLinkSection';

/***
 * MARK: AddressesSection
 * @description "Addresses & Health" block of the project settings form:
 *   Application link URL, network host override, health endpoint, and status.
 *   Pure presentational section — all state lives in `ProjectSettingsForm`.
 * @example <AddressesSection project={project} projectId={projectId} onChanged={updateProjectInState} />
 * @param {Object} props
 * @param {Object} props.project - The current project object.
 * @param {string} props.projectId - Active project identifier.
 * @param {Function} props.onChanged - Called with the updated project after save/probe/clear.
 ***/
export function AddressesSection({ project, projectId, onChanged }) {
  return (
    <div className="space-y-8">
      {/* Application Link & Health */}
      <div className="border-t border-border-standard pt-8">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-high mb-4 flex items-center gap-2">
          <span className="text-primary">🌐</span> Application Link & Health
        </h3>
        <div className="space-y-4 max-w-2xl">
          <AppLinkSection project={project} projectId={projectId} onChanged={onChanged} />
        </div>
      </div>
    </div>
  );
}
