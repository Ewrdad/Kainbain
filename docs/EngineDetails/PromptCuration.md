# Prompt curation

# Elements 

Prompts should be comprised of:
- Task prompt
- Stage Prompt
- Report prompt
- (optional) Failure details
- (optional) How to fail stage

crucially it should not include:
- History of past jobs
- knowledge of future stages
- Thinking  traces

### Task prompt
This is the main job required as derived by the task. So this can be things like “Document how system x works” or “implement an api for searching things” (obvs a bit longer). This is the overarching task and involves any context for  the task

### Stage prompt

So this is the prompt derived from the stage. Such as plan, implement plan, review for x etc. 

For example: The task prompt  can be “implement X” but stage may be “As part of this please develop and implementation plan” . Then next stage the task prompt says “implement X” still but the stage prompt can switch to “Implement plan located ./here/somewhere” 

### Report prompt

This is to outline that after a task is done it should write a summary report to ./docs/tasks/active/1234/stage etc.  The address should be dynamic and predictable as it will be re-used elsewhere such as in review stages.


### Failure details

If this  has been pushed back because of a stage failure such as from a human review or review stage.  We want to then have the flagged issues as part of the prompt, so the agent can target those issues. 

### How to fail a stage

This likely should be just something like “If you fail this stage then use the Fail_stage_skill” 

This is to allows us for review stages etc allow the agent to go “this isn’t up to standard please reject this change” or similar . Could also allow ai agents to go “this isn’t possible move it back to planning” but providing a standard interface



## General considerations

Although task and stage prompts are user defined and the failure is designed by another agent. The remaining should be aimed to be kept as small and precise as possible as to not pollute context