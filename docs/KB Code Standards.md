# Values

## User understandable over technical language

I feel like code should always be understandable by users as they are the ones who dictate process. So the goal of code should make it the most understandable with zero context as possible

### Principles

- Long variables names where needed to be descriptive
- Avoid using technical language such as “factory” or “barrel”
- Stick to a common language profile, (tasks always being tasks, stages always being stages etc)
- File structure should reflect the call stack
- Use of JSDocs to explain variables in pure english
- Include why things are done not just what is done
- Use a labelled data inport pattern (IE  `({varA , varB}) => {}`)
- NEVER MENTION DESIGN PATTERNS
- Use @example tags in js doc to easily explain functionality
  
  

## Functional over Object oreintated

Although pure functional code can tend to insanity it is always important to note co-mingle state and functionality. Where possible state should leave in clearly defined places, and functions should show a clear line in how we move from one state to another. Traditional object oriented design mainly serves to gatekeep devs(or for game dev).

### Principles

- Try and avoid using classes where possible
- Currying can be used to create sudo classes, avoid that
- Functions should follow black box mentality, clear input delivers the same output with no side affects
- Treat variables as immutable unless they are clearly defined states.
- Functions should always be named with a verb in, as they are doing something
- Give the miniumn data to each function as possible. Pick off fields before invocation.
- Each function should only work to achieve its task, with a single responsibility


## Co-location over abstraction

Although abstraction is an essential part of coding it should always only be done by business level intent, not just on functionality. Ideally if you pick a random file in the codebase you should only need to look at the one folder above it and one folder under it to get all the context on its functionality.

### Principles
- Unit tests should always be placed next to the relevant file
- Generally functions called in a higher function should be placed in a folder of that functions name. IE if `funA.js` calls `funB.js` it should be `./funA/funB.js`
- Generic/helper functions should only be made if they are repeatedly doing the same thing.
- Helpers should be treated like react state and exist at the lowest level folder that is common in the hierarchy of the folders
- If abstracting it would take up more lines/characters than just embedding that line directly on a per file basis avoid doing it. IE don’t abstract a single line just because its repeated unless it has some complex logic like a regex.
- Don’t fear repetition of code
- Make sure the code is easily searchable for any given task. If I said modify the task history box in the ui it should  be easy and logical to figure out where that is.
- Use folders as a tool for organising

## Tested over trusted 

Functionality should not assumed to exist until it is tested and evidenced. “it should work” isn’t always reliable and we want to make sure there are no regressions. 

### Principles
- Try and at least plan what tests you are going to make before you  code a function
- Don’t assume typing is correct until proven, or allow it to fail safe
- Failures should clear transparent and observable, every function doesnt need to intensly check it just needs to report failures accurately
- Tests must be consistent
- Integration test must reflect how a user could want to use the app
- Use the lowest possible level of tests( Ie Unit over api over e2e) for the fastest test cycle


## Fast iteration over long planning

Sometimes you just can’t know what will happen without using it and that is essential. Spending too long planning can cause ideas to get confused or get you trapped in a loop where you just make plans worse.  Having simple clear checkpoints is great.

### Principles
- When planning, factor in points to check certain things and how the plan can be adapted when needed
- Try and create safe ways to test functionality, ie not in prod, when possible as this will allow you to confirm things work.
- Focus on one small change at a time, get tests passing then work on the next element.
- Always design code with the intent it will be changed/replaced soon
- Minimise friction in development even if it is small
- Make change easy, then make the change. Even if making change easy is hard.



# Inspirations
My principles here are inspired by:

- Extreme programming Explained by Kent Beck (book)
- Life isn’t binary (book)
- Intent driven design by David whitney (Talk)


# Examples

## Intent Driven descriptions

### Bad Example

```js

const userInOneYearFactory = (name, age, users) => {

    const user = {name: name , age: age + 1}

    users.push(user)
  
}

const list = []

userFactory("Frank",32,list)


```

## Good example

```js

/**
* MARK: calculateAgeNextYear
* @description calculates the age someone will be next year
* @example const usersAgeNextYear = calculateAgeNextYear({ageNow: 3})  
console.log(usersAgeNextYear) // 4
*/
const calculateAgeNextYear = ({ageNow}) => {
  const ageNextYear = ageNow + 1
  
  return ageNextYear
}

const userObjectsList = []

const usersName = "Frank"
const usersAge = 32

const usersAgeNextYear = calculateAgeNextYear({ageNow: usersAge})

userObjectsList.push({name: usersName, age: usersAge})


```