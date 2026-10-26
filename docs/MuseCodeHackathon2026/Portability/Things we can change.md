# Things we can change

This is the finite list of things we can change about the behaviour. 

## Reverse symlink direction for centralised docs

Docs now should be committed into the repo they are relevant to.  The task behaviour should conflict. We can then provide the option of symlinking it to a central store in the backend to facilitate whatever functionality the user desires. 

This is done because we will need docs to be wide spread for runners to reference them. 


## UI 

A lot of UI will need to move from the past single threaded paradigm to multithreaded along with the introduction of runner config in the global settings. 

## Git behaviour

We obviously dont want merge conflicts so we may need to modify git behaviour, with a lot more pushes and pulls. Runner should also regularly hard reset its master versions to remote

We should also require a remote repository for new projects to simplify things


## Local only references

So references to things like silverbullet or forejo need to leave. (forejo references can stay as long as its derived from whatever the remote reference of that project is, will need to add things like github and gitlab aswell for example)

This doesnt apply to local ci infra such as semgrep or secobserve as that is develpment infra and not included in the final product