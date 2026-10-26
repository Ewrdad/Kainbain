# Critiques

- The task managment should be integrated into the page and not require a seperate popup
- the quick task /workflow execution pannel needs to be removed
- Theres still a context section on the page even though there should be no shared context between tasks so no point having it
- Stages dont allow fallback selection to other stages. the dropdown should just be the stages in the project
- Projects dropdown should show the folders in ~/projects
- The new projects section should create a new folder in ~/projects and a docs directory in ~/apps/notes/silverbullet/space/Projects/Personal which should be system linked to the newly created folder in ~/projects as a folder called `docs` (obvously with the real project name  in the silverbullet folder)
- the type of stage doesnt change the input. Human stages shouldnt have any input. Ci/script stages should take a bash command etc
- The settings pannel is entirely wrong
  - The settings as a tab should be per project and the file locations should be project related as mentioned above
  - The model selection should be integrated into stage selection and the face it has claude and openai implies it is not actually getting the model list from pi
  - WTF is the enviroment variables for
- no way to create or manage tasks
- Still seems to wrongly assume that a task is one continuos run where as they are seperate instances all working of a shared directory in `./docs/tasks/<taskID>/<stage-name>-<datetime>.md`
- Shuffle and loop dont make sense existing on the bottom, taking the now playing a little too litterally
- orchestrator page has an unneccesary bottom bar which just duplicates now playing
- Tasks arent actually displaying in the screen
- Overall a large lack of feedback to the user on whats happening behind the scenes
- Mobile view is unworkable