# Unable to connect to agent

## Score: 12

### Impact: 3

#### Confidentiality : 1

Unlikely to cause data leakage unless there is a subsequent bug triggered by it being down.

#### Integrity : 2

Could cause limited damage if outage/disconnect happens while acting. Low risk as most harnesses/models should be able to resume nicely however is a risk if it moves on or incorrectly passes the stage etc

#### Availability : 3

The app will likely be unable to execute its core functions. Now there may be fail overs and non agent skills can work but it would cause a large part being inaccessible

### Likelihood: 4

This is almost certain to happen whether network issues or needing to re-auth into a UI 

## Remediation

### Prevention

- Allow support for multiple harness
- Retry loops
- Using trusted and provider harness to transfer risk

### Detection

- Track harness/model reliabilty
- Indicate retry count in UI
- Report stats
- log out retry to observability platforms


### Response

- retry up to 5 times to resume session
- fail over to another model if using alias’s
- recommend user investigates on severe occurances

#### Starting Step on escalation ladder : 1

Why this was chosen 


## Tags

#project/kainbain #risk #severity/12 #ladderStart/1 #likelihood/4 #impact/3
Other tasks to make searching easier 



