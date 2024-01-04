We need this folder to connect different modules together in a loosely coupled
way. This folder contains the event bus that is used to communicate between
different modules.

This also solves following problems for us:

1. It allows us to collect results of the refactor, even if the refactor has
   failed. Ie - when exception is thrown we wouldn't have access to the result
   returned by the "refactor" function, but because we were listening on the
   event bus we can still collect the results in a separate array, without the
   need to change the way "refactor" function works - we just emit events. This
   way the code that is responsible for the refactoring is easier to test
   without extra complexities of managing mutable state.

2. It allows us to get more information about the state of the refactor, so that
   we can build a better UI around it. For example we can show which step is
   currently running, or how many steps are left, without exposing the UI
   related state to the refactor related code.

The event bus represented by an rxjs subject. There is no need to build more
abstractions on top of it - it has dispatching, subscription, teardown. However,
to capture the intent better we have `dispatch` function that is used to emit
events.
