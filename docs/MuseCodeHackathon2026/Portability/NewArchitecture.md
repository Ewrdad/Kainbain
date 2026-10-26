# New architecture

This new architecture is around making the application more portable and easier to run/get settup. 

## The docker files

These services will exist in docker files (likely based on the officail node docker images) and be organised into a docker compose


### Frontend

Responsibilities: 
- Surfacing information to the users
- User interactions


### Backend

Responsibilities
- Prompt curation
- Queue managment
- Project management
- API interactions
- Log curation
- Data agrigation
- Runner coordination
- Frontend to runner gateway
- Skills management
- Repo management

This is the apparent “ENGINE” of kainbain

This backend will mount a local folder that contains the kainbain general config (in a sqliteDb file and .env files) and a master version of projects (since we are still file orientated this acts as the DB)



## Runners - Native software

These runners should be their own runnable software as this interacts directly with harnesses such as muse code. This allows users to package it up however they like. 

Runner may take impromptu requests from the backend from a separate mechanism. This can be for things such as doing the retrospectives page comments. These tasks should almost always be read only (later feature may include automated or centralised maintenance but at the moment that's unneeded)

### Lifecycle of a runner

1. Runner is installed
2. Runner discovers its local harnesses
3. Runner registers with the backend
4. Backend tells runner to load a repo
5. Runner git clones repo to projects folder
6. Runner requests task
7. Backend delivers picks a task for it based on projects loaded and harnesses/models availble
8. Runner git pulls relevant project
9. Runner creates temp worktree folder for task branch
10. Runner runs task (while reporting to backend data)
11. Runner commits and pushes behaviour
12. Runner marks as complete in backend
13. Runner requests next task
    ... And so on


### Runner maintaince

Runners will need to also do things like:
- Check for harness changes and make sure they are reflected in the backend
- Safely handle reboots
- Clear old git worktrees after a set limit is reach (say like 5)


## The Default

As an install  there should by default be a backend,frontend and one runner installed locally, This allows for it to function as it currently does. 

## Scalability

The UI should be able to scale as much as needed. The User should also  be able to set up as many runners as wanted, allowing for many parallel tasks. 

Currently the only difficult bit is scaling the backend as it is the central source of truth. However this should be fine for current deployments, but may keep an eye on it in future.


## Whats the same

- All functionality should be the same!
- Still keep to using the repo as the source of truth, including tasks (over a seperate database (can use one as cache only))
- Still threaded (Each runner is one “thread”)
- Same queue priority



## Dangers

- A lot of assumptions have been made around this one thread architecture
- UI is not currently settup to deal with multiple threads
- Will need to implement some sort of easy authentication between runners and the backend to prevent random access
- Will need to make sure two agents arent running the same task at the same time. (Need to explore either sharding or locking mechnisms)
- Some concern over heavy file operations (hoping preloading projects then git worktrees resolves this)
- Different capabilities with different runners
- How alias’s are handled(Pick from availble and shift % to weighted probability of if a runner has all (scalable to how many it does have to keep same proportate weights))

## Diagram

```excalidraw
url:Projects/Personal/KainBain/MuseCodeHackathon2026/Portability/NewArchitecture.excalidraw
height:500px
```
url:Projects/Personal/KainBain/MuseCodeHackathon2026/Portability/NewArchitecture.excalidraw
height:500px
