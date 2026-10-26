# Harness support tiers

I am breaking Down tiered support for harnesses as to simply understand where each existing harness lives and works. These arent intended to be dogmatic and are just language to explain how these work under the hood. 

## Tier

- Tier 1 | Direct in kainbain integration
- Tier 2 | Acp or separate programmatic invocation
- Tier 3 | Exec/-p functionality
- Tier 4 | Seperate invocation needed
- Not supported

### Tier 1 | Direct in kainbain integration

This is the directly tying the harness into kainbain. Kainbain has access to the code, lowlevel operations and other core parts of the harness.  The harness may still be maintained externally and imported like an npm package, but the option to pull on it is there and this allows for tighter integration. 

Config here is likely stored in kainbain although we may chose to clone it from somewhere else 


### Tier 2 | Acp or separate programmatic invocation

This means the agent harness was designed with something like kainbain in mind and allows a dedicated interface. The most common version of this is likely the agent context protocol(ACP)
but this may also be a MCP server or some other method .  

Crucially while config likely largely lives within the harness itself, there is two way communication between kainbain and the harness. Kainbain is likely able to intervene, steer or otherwise interact with running sessions

### Tier 3 | Exec/-p functionality

This is where stdout and stdin are the main way of interacting with the harness. Effectively at this tier kainbain is just issueing `harness -p “Kainbain prompt”` and letting it trigger. We may get back stdout as it operates or even have it return things in a standard format but it is largely one way communication. 

Config definitely lives in the harness and it may be difficult to get a model list from them. 


### Tier 4 | Seperate invocation needed

At this tier it is barely integrated into kainbain. Kainbain may generate a prompt,branch or other misc items but the actual invocation has to be done by a user or seperate polling process. This might be due to compliance or permissions reasons. Although maybe automated to some degree it effectively like the user copying the prompt message and posting it in a seperate terminal. 

The app may not even exactly know where the binary is for the harness or many details about it. 

### Not Supported

This is simply if there is no way to integrate with a harness at all. 

## Where each harness actually sits

For the tier every registered harness offers on today's infrastructure —
plus the theoretical maximum each could reach — see the companion table in
[HarnessSupportLevels.md](HarnessSupportLevels.md). The System Settings ›
Harness tab renders the same labels (backend-derived, per row); a superseded
first cut of the table lives in
[HarnessSupportTiersAdj.md](HarnessSupportTiersAdj.md).