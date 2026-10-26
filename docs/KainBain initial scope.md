# Kain Bain Initial scope

## Goal
This is in order to try and allow for automation of short session ai agents in the style of KanBan. This is inspired by the KanBan mode in hermes agent, however unlike hermes agent I don’t need a  a monitoring cycle or deep memory system, Just need a way to coordinate seperate instances. 

This is like allowing the user to be any person  in a traditional dev team with a user interface like a kanban board in jira or gitlab. 

To reduce the context for tasks(to avoid a proper memory system) it needs focus on multiple tiny tasks over an overarching larger long running agentic task. It also supports the fact if using local/compute limited AI’s it makes more sense to serialise them than parallelise 



## Integrations

Notes,artefacts and config should all be markdown based with 2 possible locations, either in the project files or in a dedicated project notes folder. This is because I want to integrate it so I can read reports and edit prompts in my notes app, Silver Bullet.

This should also use a standard git workflow, it doesn’t need fancy things like worktree support or parrell agents as that would get complex. 

AI agents I want loosely based around my pi agent, as its the same thing I use for agentic coding directly so ergo have everything setup. 

This should use docker(at least for the UI) in order help it fit in with the general app structure


## Workflow 

It should be customisable but Im loosely planning around something like: 

1. Write a ticket and mark it as ready for elab
2. AI agent analyses current project and creates a plan for the ticket
3. User writes the comments and pushes it back to needing elab
4. A new ai agent reads plan, updates it based on comments and double checks the whole thing is reasonable (maybe pushback if needed)
5. User reviews plan, maybe makes manual tweaks in silver bullet.
6. User marks it good to go act
7. a new Ai agent executes plan and creates a report
8. Automated CI checks run (push back to implement with fresh context if fails)
9. a new AI agent,or multiple, reviews the work next to the plan and report and decides to either reject or approve (writes findings down) (push back to implement with fresh context if fails)
10. Change is committed and pushed to main
11. Ticket is resolved and notes are moved to a done section

However this process should be flexible. For example :
- I may want to split out security and UX reviews into their own agents
- I may want to add a “break this ticket down into multiple tickets” stage.
- If this isnt a coding project my main output may be just the notes in a deep research element
- I may want to add a deploy step to the end
- I may want an automatic “cron job” that just executes doing some kind of analysis and update and just needs approval from me. 

This and more reasons mean I need more options to edit it. (did consider if I can use something like n8n as base for this but unsure. )

## UX 
It needs to be a web app. Work has already been done to allow secure access to web pages. This inherently enforces us to have some kind of architecture with a core “engine” and a “ui” layer. This should probably all be done with JS as it is the most compatible with PI agent and the web. 

Needs to support both mobile and desktop views


#project/kainbain #plan #scope #design #author/human
