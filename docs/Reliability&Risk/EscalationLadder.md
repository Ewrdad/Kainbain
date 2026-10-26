# Escalation ladder

This indicates the order of how abnormal or possibly disruptive events should be handled. Largely a higher number (or step with the ladder analogue) should only be pursued if the earlier stages have been attempted and failed. 

## Priority & Goal

The main goal is:

- To Prevent/Limit Human intervention needed
- To prevent burn out of token usage limits.

Some other important,although less so, goals are:

- To prevent misaligned behaviour
- To prevent wasted compute and energy
- To maintain network security

## Escalation ladder

In summary it is:

1) Automated Scripted in task recovery
2) Agent lead in task recovery
3) Task interrupt and resume
4) Task retry from current stage with existing branch
5) Fail the task, to allow earlier stages to correct issues.
6) Request for Human intervention, Continue standard operations
7) Halt task until Human intervention, continue with others
8) Halt all tasks, Restart the app/redeploy
9) Halt all tasks, wait for human intevention


### Step 1 Automated scripted in task recovery

#### Description

This means issues are handled naturally in code. This can be things such as retry loops, backup implementations and general reliable design. This is the cheapest,easiest and safest method of recovery and the key to this is it is handled without using tokens, this barely seeming any different to the app just working as intended.

#### Examples

- API backoff retry loops
- try catch handling of errors
- Minimal data transformation
- Preventative design
- Force shutdowns if things cant be done properly

### Step 2 Agent lead in task recovery

#### Description

This largely if there is an error while an agent is running, hoping it surfaces mid run and therefore they can solve it. Again shouldnt look any different to a user to normal operations, just maybe some different logs or higher token output

#### Examples

- Failing tests
- Verdict requirements
- Files being in different places than usual.
  
### Step 3 Task interrupt and resume

#### Description

This is the “turn it off and on again” part of a task. Hopefully things can be resumed middle of the task with little interactions. The only thing the user should notice is it taking a little longer than usual. 

#### Examples

- Finishing merge after interruption
- Recovering after a restart/deploy
- Session resume on connectivity issues to agents
- User pauses and unpauses the operation

### Step 4 Task retry from current stage with existing branch

#### Description 
This is where we effectively do the stage from scratch. Uses when we think the current stage is unrecoverable. This is essentially treating it as a new task entering a stage. 

##### examples

- retry stage as an agent triggered loop protection
- connection issues caused the agent to fail so retry
- Error processing approval on a human stage

### step 5 Fail the task, to allow earlier stages to correct issues

#### Description 
This is failing to a previous stage in a hope thatll fix it. There is always a risk this causes loops and it is depending on the users configuration a lot. 


#### Examples
- merge conflict on merge stage failing back to an agent stage to resolve.
- system test stage fails back to an agent to fix
- a agent stage has failed multiple times and falls back to a human review.


### Step 6 Request for Human intervention, Continue standard operations

#### Description 
This is where we alert the user and provide an option to intervene while still trying the earlier methods. This is different to just good Observability on this behaviour as it is specifically requesting that human intervention is likely needed, but we still keep trying. 


#### Examples
- nearing a retry notification limit we may flag it as problematic
- Early notice of a possible loop
- having a temporary freeze option for a user to intervene as needed (while still running if not )
- push notification to user for multiple failing tasks
- flag that an alias model or harness reliability goes below a threshold (over enough samples)

### Step 7 Halt task until Human intervention, continue with others

#### Description 
All tasks should be isolated from eachother so in most cases even if one task is borked we can let it continue to operate others. This will need to be flagged to the user to come intervene and provide tools and any information needed. This generally should be avoided as is a clear sign the project is stuck

#### Examples

- Retry loop exhaustion, Escalating from earlier warnings
- Some wierd git behaviour that cant be resolved automatically and needs manual resoloution
- Model choice is causing all tasks on a stage to fail constantly and require user to fix harness/model
- Unable to find referenced files that where assumed existing and it would be unsafe/illogical to create them now or procede without


### Step 8 Halt all tasks, Restart the app/redeploy

#### Description
This is to tackle system wide issues and almost never should be pulled, however is the ultimate turn it off and on again. This involves restarting kainbain and making sure it is on the latest version. 

#### Examples
- Unable to run any exec or terminal access commands to restart to pickup changes
- Error during redeployment needing a fresh redeploy(or revert and deploy)
- UI requests are entirely unable to reach the backend
- Missing core file requiring a restart to guarentee file is accesible


### Step 9 Halt Everything wait for human intervention

#### Description

At the end of the day some things will need a human to fix them, this therefore involves making sure all the knowledge and reasons why things failed are availble for the user to come and fix it. It is also involving purposely not doing anything so that the user doesnt have to contend with moving behavuoir while trying to fix it (Like you’d turn an engine off before working on it)

#### Examples

- App Restart exhaustion
- Deploy retry exhaustion
- Severe/repeated guard mechanisms tripping
- Deployment server in repeated restart loop


## Observability vs request for help

It is important to note that we always want to maintain observability of when remediation steps are taken and this should be reflected. A request for help should be noticably different and actively raise concerns to the user. For example we may log early steps to the logs so we can see whats happened, where as if we need user support we may have a popup on the screen. 


#project/kainbain #risk #documentation #esclationLadder #response 

