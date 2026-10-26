## Summary 
This is the first build that is usable but it still needs some work to be positive


## Feedback
- Failed tags don't disappear after success
- it is reporting agent stage complete then still doing stuff
- A lot of clipping of Popup boxes
- Things don't move across the board if page is not focuesed
- Slow to load some elements
- Observability screen needs to be condensed to what can fit on one normal monitor (currently has bit of scroll)
- Think I previously asked for a sliding animation when things moved between columns but that doesn't exist
- I would like it if you could open a task in its own page so if you want to just focus on elaborating that one task you could (plus then link to that task)
- Still a little bit of things “vibrating” with sizing
- stage timeout needs to be by default like half an hour but can implement a stage by stage override option
- If autoscroll is on on logs it should automatically take you to the most recent log (it doesn't just shows the top)
- monitor shouldnt be a tab since it is for the whole app not just that project. It should stay in the top right and therefore we can lose that vertical tab bar on that screen (condensing it more)
- Analytics fights with its own popup
- some pop ups in the stage columns are cut off
- Still a bunch of useless numbers on the tab navigation bar that can go
-  the “all, active, needs review” toggle should be “All, Failed, human only” The Human only hiding the agent and ci steps
-  The report viewer needs a major overhall . It is difficult to view when there are multiple reports. And I couldn't see reports for every stage which I think is a visual bug not and agent one but unsure. Requires thorough work
-  Dont need a toast notification every time something moves stages
-  More drop downs clashing with their popups
-  we have 3 header bands at the top of the page , if possible I'd love to collapse it to 1(2 if needed)
-  logs keeps randomly opening itself
-  kainbain ochestrator title can be collapsed/removed as needed
- production build is a button for some reason rather than just a subtle indicator
- remove deployment from settings. Deployment should only be as its own stage in the pipeline
- Deployment system is from an agent getting confused for it to be able gracefully deploy itself when what I meant is “I want the final stage of the kainbain pipeline to be ./deploy.sh --prod which must be able to gently redeploy kainbain without issue” not an aspect of the settings etc
- Clear logs doesn't work
- Copy logs doesn't work
- Shouldn't be able to scroll forward in the now playing bar if there isn't another task queued
- Queue in observability seems to include human review when the queue should only show things the system is scheduling to do (also shows “done” tasks that should be removed should only show what its about to do)
- stage management cog can be removed as it is a legacy of an older time (along with its side tab)
- can  analytics be integrated into the stages somehow and not be yet another top header bar
- Should only show links to forejo if the project does have an upstream repo
- Add task button looks awkward and needs stretching out to fill space
- “5 stages • 5 in flight • 1 completed” can be removed and isn't useful
- Stage prompt should also have the keyword functionality 