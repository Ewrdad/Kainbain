# Human review after Attempt one

## Key flaws : usability/functionality

1. Task management is a side bar instsead of its own tab page
2. Project management has no settings pages or configuration
3. A made up session tree is there
4. Fallback doesnt allow for stage skips
5. Stage/workflow manipulation isnt integrated into the page as per the design
6. Task management doesnt work
7. Context counter implies that we are reusing context when we should be creating a new running instance per task per stage per run
8. No buttons on ui seem to work with backend
9. Page is not adjustable
10. Human stages dont seem to exist
11. Bot/script stages dont exist
12. Doesnt allow to fall back to an earlier stage if it isnt before or after immediatlyShould allow fail back to any stage
13. Project selectdoes nothing
14. Now playing bar is taking whole screen width
15. the start your engines /compute stop / similar messages shouldnt exist in the top right. If they exist should be integrated into the now playing (it is the poin of the play pause button) 
16. Hundreds of errors in terminal

## Key flaws : Goal alignment

1. Custom features have been implemented
2. We implmented the changing port of the back/frontend but they seem ignorant of eachothers state
3. Design documents where not refered to enough
4. Seemd to lack taking inspiration from jira/trello/gitlab and focus more on a t3code/codex interface wrongly


## Key Flaws :  Code quality

1. `~/projects/kainbain/frontend/src/components/App.jsx` Is far too long and should be broken down a lot
2. Overall very flat structure when it should be much deeper nested
3. Looks like there is functions being applied to a state which seems to be implementing classes. I dont want classes
4. unit tests should be right next to their appropriate files not in a seperate folder
5. not enough automated tests