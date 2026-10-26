/***
 * MARK: slugifyProjectName
 * @description Converts a project name into a sanitized filesystem slug.
 * @example slugifyProjectName('My Awesome Project!') => 'my-awesome-project'
 * @param {string} name
 * @returns {string}
 ***/
export function slugifyProjectName(name) {
	if (!name) return "untitled-project";
	return (
		String(name)
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9-_]/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "") || "untitled-project"
	);
}

